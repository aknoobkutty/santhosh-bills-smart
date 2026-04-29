import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Camera, X } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDetected: (code: string) => void;
};

export function CameraScannerDialog({ open, onOpenChange, onDetected }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string | undefined>();
  const [status, setStatus] = useState<string>("Requesting camera access…");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    setStatus("Requesting camera access…");
    const reader = new BrowserMultiFormatReader();

    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setError("Camera API is not supported in this browser. Use Chrome/Safari over HTTPS.");
          return;
        }

        // 1. Request permission FIRST — this is what triggers the browser prompt
        // and unlocks device labels for enumeration.
        let permStream: MediaStream;
        try {
          permStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: "environment" } },
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

        const controls = await reader.decodeFromVideoDevice(chosen, videoRef.current!, (result) => {
          if (result) {
            onDetected(result.getText());
            controls.stop();
            onOpenChange(false);
          }
        });
        controlsRef.current = controls;
        setStatus("Point camera at a barcode / QR code");
      } catch (e) {
        setError((e as Error).message || "Camera access failed");
      }
    })();

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, deviceId]);

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
        <Button variant="outline" onClick={() => onOpenChange(false)}><X className="h-4 w-4 mr-2" />Close</Button>
      </DialogContent>
    </Dialog>
  );
}
