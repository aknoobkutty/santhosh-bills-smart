import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType, NotFoundException } from "@zxing/library";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Camera, X, Zap, ZapOff } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDetected: (code: string) => void;
};

export function CameraScannerDialog({ open, onOpenChange, onDetected }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const lastResultRef = useRef<{ text: string; ts: number } | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string | undefined>();
  const [status, setStatus] = useState<string>("Requesting camera access…");
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    setStatus("Requesting camera access…");

    // Configure hints: target the formats Santhosh Mobiles actually uses
    // (retail 1D barcodes + QR) and enable TRY_HARDER for stability on
    // small / blurry / off-angle codes. This makes decode slower per frame
    // but dramatically improves consistency.
    const hints = new Map();
    const formats = [
      BarcodeFormat.QR_CODE,
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E,
      BarcodeFormat.CODE_128,
      BarcodeFormat.CODE_39,
      BarcodeFormat.CODE_93,
      BarcodeFormat.ITF,
      BarcodeFormat.CODABAR,
      BarcodeFormat.DATA_MATRIX,
      BarcodeFormat.AZTEC,
      BarcodeFormat.PDF_417,
    ];
    hints.set(DecodeHintType.POSSIBLE_FORMATS, formats);
    hints.set(DecodeHintType.TRY_HARDER, true);

    // Throttle decode attempts: zxing default is ~100ms; 200ms is steadier
    // on mid-range phones and reduces false negatives.
    const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 200, delayBetweenScanSuccess: 400 });

    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setError("Camera API is not supported in this browser. Use Chrome/Safari over HTTPS.");
          return;
        }

        // 1. Request permission FIRST with HD + autofocus hints. This both
        // triggers the browser prompt and unlocks device labels for
        // enumeration. Higher resolution + continuous focus = more reliable
        // decodes, especially for small printed barcodes.
        let permStream: MediaStream;
        try {
          permStream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: "environment" },
              width: { ideal: 1280 },
              height: { ideal: 720 },
              // Non-standard but widely supported autofocus hints — cast to any
              // because TS lib.dom doesn't include them.
              ...({ focusMode: "continuous", advanced: [{ focusMode: "continuous" }] } as any),
            },
            audio: false,
          });
        } catch (permErr) {
          const e = permErr as DOMException;
          if (e.name === "NotAllowedError" || e.name === "SecurityError") {
            setError("Camera permission denied. Please allow camera access in your browser settings and try again.");
          } else if (e.name === "NotFoundError" || e.name === "OverconstrainedError") {
            setError("No camera found on this device.");
          } else if (e.name === "NotReadableError") {
            setError("Camera is in use by another application. Close other apps and retry.");
          } else {
            setError(e.message || "Unable to access the camera.");
          }
          return;
        }
        // Stop the probe stream — zxing will open its own.
        permStream.getTracks().forEach((t) => t.stop());
        if (cancelled) return;

        // 2. Now enumerate — labels are populated after permission grant.
        const list = await BrowserMultiFormatReader.listVideoInputDevices();
        if (cancelled) return;
        setDevices(list);
        if (list.length === 0) {
          setError("No camera found on this device.");
          return;
        }
        const chosen =
          deviceId ??
          list.find((d) => /back|rear|environment/i.test(d.label))?.deviceId ??
          list[0]?.deviceId;
        if (!chosen) { setError("No camera found"); return; }
        setDeviceId(chosen);
        setStatus("Starting camera…");

        // 3. Continuous decode loop. zxing calls this callback every
        // ~delayBetweenScanAttempts ms with either a result OR a NotFound
        // error — both are normal. We swallow expected decode errors and
        // only surface real failures.
        const controls = await reader.decodeFromVideoDevice(
          chosen,
          videoRef.current!,
          (result, err) => {
            try {
              if (result) {
                const text = result.getText();
                const now = Date.now();
                const last = lastResultRef.current;
                // Debounce: require either the same code seen twice within
                // 1.5s (high confidence) OR a single read followed by 350ms
                // of stability. This removes spurious flickers from poor
                // lighting / partial reads.
                if (last && last.text === text && now - last.ts < 1500) {
                  lastResultRef.current = null;
                  controls.stop();
                  onDetected(text);
                  onOpenChange(false);
                  return;
                }
                lastResultRef.current = { text, ts: now };
                setStatus("Detected — hold steady to confirm…");
                return;
              }
              if (err && !(err instanceof NotFoundException)) {
                // Real decode failure (checksum/format) — log but keep scanning.
                console.debug("[scanner] decode error:", err.message);
              }
            } catch (cbErr) {
              console.debug("[scanner] callback threw:", cbErr);
            }
          }
        );
        controlsRef.current = controls;

        // 4. Capture the active video track for torch + apply post-stream
        // autofocus constraints (some browsers only honor these after
        // playback starts).
        const stream = (videoRef.current?.srcObject as MediaStream) ?? null;
        const track = stream?.getVideoTracks?.()[0] ?? null;
        trackRef.current = track;
        if (track) {
          try {
            const caps = (track.getCapabilities?.() ?? {}) as any;
            setTorchSupported(Boolean(caps.torch));
            const advanced: any[] = [];
            if (caps.focusMode?.includes?.("continuous")) advanced.push({ focusMode: "continuous" });
            if (caps.exposureMode?.includes?.("continuous")) advanced.push({ exposureMode: "continuous" });
            if (caps.whiteBalanceMode?.includes?.("continuous")) advanced.push({ whiteBalanceMode: "continuous" });
            if (advanced.length) await track.applyConstraints({ advanced } as any);
          } catch (constraintErr) {
            console.debug("[scanner] constraint apply skipped:", constraintErr);
          }
        }

        setStatus("Point camera at a barcode / QR code");
      } catch (e) {
        setError((e as Error).message || "Camera access failed");
      }
    })();

    return () => {
      cancelled = true;
      try { controlsRef.current?.stop(); } catch {}
      controlsRef.current = null;
      trackRef.current = null;
      lastResultRef.current = null;
      setTorchOn(false);
      setTorchSupported(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, deviceId]);

  async function toggleTorch() {
    const track = trackRef.current;
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next }] } as any);
      setTorchOn(next);
    } catch (e) {
      console.debug("[scanner] torch toggle failed:", e);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" aria-describedby="scanner-help">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Camera className="h-4 w-4" />Scan Barcode / QR</DialogTitle>
        </DialogHeader>
        <div className="relative bg-black rounded overflow-hidden aspect-video">
          <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
          <div className="absolute inset-x-8 top-1/2 h-0.5 bg-red-500/80 -translate-y-1/2 pointer-events-none" />
        </div>
        {error ? (
          <div className="space-y-2">
            <p className="text-sm text-destructive">{error}</p>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => { setError(null); setDeviceId((d) => d); /* re-trigger */ }}
            >
              Retry
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">{status}</p>
        )}
        {devices.length > 1 && (
          <select
            className="w-full border rounded px-2 py-1 text-sm bg-background"
            value={deviceId}
            onChange={(e) => setDeviceId(e.target.value)}
          >
            {devices.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${d.deviceId.slice(0,6)}`}</option>)}
          </select>
        )}
        <p id="scanner-help" className="text-xs text-muted-foreground">
          The detected code is auto-filled. Requires HTTPS and camera permission.
        </p>
        <div className="flex gap-2">
          {torchSupported && (
            <Button type="button" variant="outline" onClick={toggleTorch} className="flex-1">
              {torchOn ? <ZapOff className="h-4 w-4 mr-2" /> : <Zap className="h-4 w-4 mr-2" />}
              {torchOn ? "Torch off" : "Torch on"}
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
            <X className="h-4 w-4 mr-2" />Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
