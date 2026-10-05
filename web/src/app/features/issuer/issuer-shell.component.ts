import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { ProfileService } from '../../core/profile.service';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { BrandComponent } from '../../core/brand.component';
import { ChainService } from '../../core/chain.service';
import { HealthService } from '../../core/health.service';
import { IconComponent } from '../../core/icon.component';
import { cfg } from '../../core/runtime';
import { initialsOf, short } from '../../core/util';
import { RecoveryModalComponent } from './recovery-modal.component';

@Component({
  selector: 'app-issuer-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, IconComponent, BrandComponent, RecoveryModalComponent],
  templateUrl: './issuer-shell.component.html',
  styleUrl: './issuer-shell.component.css',
})
export class IssuerShellComponent implements OnInit {
  protected readonly chain = inject(ChainService);
  protected readonly health = inject(HealthService);
  protected readonly profiles = inject(ProfileService);
  protected readonly cfg = cfg;
  protected readonly short = short;
  protected readonly menuOpen = signal(false);
  protected readonly nick = signal('');
  protected readonly me = computed(() => this.profiles.resolve(this.chain.account()));
  protected readonly nav = [
    { path: 'issue', label: 'Issue credential', icon: 'file-plus' },
    { path: 'credentials', label: 'Credentials', icon: 'badge-check' },
    { path: 'recipients', label: 'Recipients', icon: 'users' },
    { path: 'transactions', label: 'Transactions', icon: 'blocks' },
    { path: 'audit', label: 'Audit log', icon: 'history' },
    { path: 'issuers', label: 'Issuer access', icon: 'key-round' },
  ];

  ngOnInit(): void { this.health.start(); void this.chain.restore(); }

  protected initials(): string { const m = this.me(); return m.source === 'none' ? (this.chain.account() ?? '??').slice(2, 4).toUpperCase() : initialsOf(m.name); }
  protected saveNick(): void { const a = this.chain.account(); if (a) { this.profiles.setNickname(a, this.nick()); this.nick.set(''); } }
  protected async pick(mode: 'dev' | 'injected', index = 0): Promise<void> { this.menuOpen.set(false); await this.chain.connect(mode, index); }
  protected stateLabel(): string { return this.health.allUp() ? 'Healthy' : this.health.firstCheckDone() ? 'Degraded' : 'Checking'; }
}
