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

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    const reader = new BrowserMultiFormatReader();

    (async () => {
      try {
        const list = await BrowserMultiFormatReader.listVideoInputDevices();
        if (cancelled) return;
        setDevices(list);
        const chosen = deviceId ?? list.find((d) => /back|rear|environment/i.test(d.label))?.deviceId ?? list[0]?.deviceId;
        if (!chosen) { setError("No camera found"); return; }
        setDeviceId(chosen);
        const controls = await reader.decodeFromVideoDevice(chosen, videoRef.current!, (result, err) => {
          if (result) {
            onDetected(result.getText());
            controls.stop();
            onOpenChange(false);
          }
        });
        controlsRef.current = controls;
      } catch (e) {
        setError((e as Error).message || "Camera access denied");
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Camera className="h-4 w-4" />Scan Barcode / QR</DialogTitle>
        </DialogHeader>
        <div className="relative bg-black rounded overflow-hidden aspect-video">
          <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
          <div className="absolute inset-x-8 top-1/2 h-0.5 bg-red-500/80 -translate-y-1/2 pointer-events-none" />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {devices.length > 1 && (
          <select
            className="w-full border rounded px-2 py-1 text-sm bg-background"
            value={deviceId}
            onChange={(e) => setDeviceId(e.target.value)}
          >
            {devices.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${d.deviceId.slice(0,6)}`}</option>)}
          </select>
        )}
        <p className="text-xs text-muted-foreground">Point your camera at a barcode or QR code. The number is auto-filled.</p>
        <Button variant="outline" onClick={() => onOpenChange(false)}><X className="h-4 w-4 mr-2" />Close</Button>
      </DialogContent>
    </Dialog>
  );
}
