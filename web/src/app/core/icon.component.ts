import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import {
  Accessibility, BadgeCheck, Bell, Blocks, Boxes, CalendarClock, Calendar, Camera, CameraOff, Check, ChevronDown, CircleAlert, Circle, Clipboard, CloudCheck, CloudOff,
  Copy, Download, FileCode2, FileLock2, FilePlus, FileUp, Fingerprint, Hash, History, KeyRound, Keyboard, LockKeyhole, Link, Mail, Plus, QrCode, Radio,
  ReceiptText, RefreshCw, ScanLine, Search, SearchX, ShieldAlert, ShieldCheck, TriangleAlert, User, UserRoundCheck, Users, WalletCards, X, Zap, Ban, Clock, IconNode,
} from 'lucide';

const ICONS: Record<string, IconNode> = {
  accessibility: Accessibility, 'badge-check': BadgeCheck, bell: Bell, blocks: Blocks, boxes: Boxes, 'calendar-clock': CalendarClock, calendar: Calendar, camera: Camera,
  'camera-off': CameraOff, check: Check, 'chevron-down': ChevronDown, 'circle-alert': CircleAlert, circle: Circle, clipboard: Clipboard, 'cloud-check': CloudCheck,
  'cloud-off': CloudOff, copy: Copy, download: Download, 'file-code-2': FileCode2, 'file-lock-2': FileLock2, 'file-plus': FilePlus, 'file-up': FileUp,
  fingerprint: Fingerprint, hash: Hash, history: History, 'key-round': KeyRound, keyboard: Keyboard, 'lock-keyhole': LockKeyhole, link: Link, mail: Mail, plus: Plus,
  'qr-code': QrCode, radio: Radio, 'receipt-text': ReceiptText, 'refresh-cw': RefreshCw, 'scan-line': ScanLine, search: Search, 'search-x': SearchX,
  'shield-alert': ShieldAlert, 'shield-check': ShieldCheck, 'triangle-alert': TriangleAlert, user: User, 'user-round-check': UserRoundCheck, users: Users,
  'wallet-cards': WalletCards, x: X, zap: Zap, ban: Ban, clock: Clock,
};

/** Lucide icon by kebab-case name. Only the icons registered above are bundled (tree-shaken). */
@Component({
  selector: 'app-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
  host: { '[innerHTML]': 'svg()', 'aria-hidden': 'true', style: 'display:inline-flex;flex:none;line-height:0' },
})
export class IconComponent {
  readonly name = input.required<string>();
  readonly size = input(16);
  readonly stroke = input(2);
  private readonly sanitizer = inject(DomSanitizer);

  protected readonly svg = computed(() => {
    const node = ICONS[this.name()] ?? [];
    const attrs = (a: Record<string, unknown>) => Object.entries(a).map(([k, v]) => `${k}="${v}"`).join(' ');
    const body = (node as unknown as [string, Record<string, unknown>][]).map(([tag, a]) => `<${tag} ${attrs(a)}/>`).join('');
    return this.sanitizer.bypassSecurityTrustHtml(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${this.size()}" height="${this.size()}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${this.stroke()}" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`,
    );
  });
}
