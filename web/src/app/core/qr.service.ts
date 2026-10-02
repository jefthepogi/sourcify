import { Injectable } from '@angular/core';
import jsQR from 'jsqr';
import QRCode from 'qrcode';

@Injectable({ providedIn: 'root' })
export class QrService {
  /** The QR carries only a short verification URL; error correction is set to H so printed or scuffed codes still scan. */
  verifyUrl(docHash: string): string { return `${location.origin}/verify/${docHash}`; }

  toDataUrl(text: string, width = 320): Promise<string> {
    return QRCode.toDataURL(text, { errorCorrectionLevel: 'H', margin: 2, width, color: { dark: '#111827', light: '#ffffff' } });
  }
}

/** Camera-based QR reader built on getUserMedia (WebRTC) + jsQR. */
export class QrScanner {
  private stream?: MediaStream;
  private raf = 0;
  private running = false;
  torchSupported = false;

  async start(video: HTMLVideoElement, onText: (text: string) => void): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false });
    const track = this.stream.getVideoTracks()[0];
    this.torchSupported = !!(track.getCapabilities?.() as any)?.torch;
    video.srcObject = this.stream;
    await video.play();
    this.running = true;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    let last = 0;
    const tick = (now: number) => {
      if (!this.running) return;
      if (now - last > 100 && video.videoWidth) {
        last = now;
        canvas.width = video.videoWidth; canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const hit = jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' });
        if (hit?.data) { onText(hit.data); return; }
      }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  async setTorch(on: boolean): Promise<void> {
    await this.stream?.getVideoTracks()[0].applyConstraints({ advanced: [{ torch: on } as any] });
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.stream?.getTracks().forEach((t) => t.stop());
  }
}
