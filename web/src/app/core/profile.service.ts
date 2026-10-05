import { Injectable, inject, signal } from '@angular/core';
import { ChainService } from './chain.service';
import { LedgerService } from './ledger.service';
import { DEMO_PROFILES } from './profiles';
import { short } from './util';

export interface Profile {
  address: string;
  name: string;
  /** Without the leading @; empty when unknown. */
  username: string;
  title: string;
  source: 'address-book' | 'demo' | 'on-chain' | 'none';
}

const BOOK_KEY = 'sourcify.addressbook.v1';

/**
 * Maps a wallet address to a human-readable profile. Wallets (MetaMask included) do not expose account names to
 * web pages, so names come from, in order: (1) this browser's address book, (2) the demo directory for the local
 * dev accounts, (3) the issuer name recorded on-chain by the owner, (4) the shortened address.
 */
@Injectable({ providedIn: 'root' })
export class ProfileService {
  private readonly chain = inject(ChainService);
  private readonly ledger = inject(LedgerService);
  private readonly book = signal<Record<string, string>>(this.load());

  resolve(address: string | null | undefined): Profile {
    const a = (address ?? '').toLowerCase();
    if (!a) return { address: '', name: '—', username: '', title: '', source: 'none' };
    const nick = this.book()[a];
    if (nick) return { address: address!, name: nick, username: '', title: 'Saved in this browser', source: 'address-book' };

    const idx = this.chain.devAccounts().findIndex((x) => x.toLowerCase() === a);
    if (idx >= 0 && idx < DEMO_PROFILES.length) {
      const d = DEMO_PROFILES[idx];
      return { address: address!, name: d.name, username: d.username, title: d.title, source: 'demo' };
    }
    const onChain = this.ledger.issuerNames().get(a);
    if (onChain) return { address: address!, name: onChain, username: '', title: 'Issuer name recorded on-chain', source: 'on-chain' };
    return { address: address!, name: short(address, 6, 4), username: '', title: '', source: 'none' };
  }

  name(address: string | null | undefined): string { return this.resolve(address).name; }

  /** "@username" when known, else the display name. */
  handle(address: string | null | undefined): string {
    const p = this.resolve(address);
    return p.username ? `@${p.username}` : p.name;
  }

  /** Save (or clear, when empty) a local display name — the practical way to name MetaMask accounts. */
  setNickname(address: string, name: string): void {
    const next = { ...this.book() };
    const clean = name.trim().slice(0, 40);
    if (clean) next[address.toLowerCase()] = clean; else delete next[address.toLowerCase()];
    this.book.set(next);
    try { localStorage.setItem(BOOK_KEY, JSON.stringify(next)); } catch { /* private mode: keep in memory */ }
  }

  private load(): Record<string, string> {
    try { return JSON.parse(localStorage.getItem(BOOK_KEY) ?? '{}') ?? {}; } catch { return {}; }
  }
}
