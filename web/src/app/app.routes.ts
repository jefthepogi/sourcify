import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'issuer/issue' },
  {
    path: 'issuer',
    loadComponent: () => import('./features/issuer/issuer-shell.component').then((m) => m.IssuerShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'issue' },
      { path: 'issue', title: 'Issue a credential · Sourcify', loadComponent: () => import('./features/issuer/issue.component').then((m) => m.IssueComponent) },
      { path: 'issuers', title: 'Issuer access · Sourcify', loadComponent: () => import('./features/issuer/issuers.component').then((m) => m.IssuersComponent) },
      { path: ':view', title: 'Ledger · Sourcify', loadComponent: () => import('./features/issuer/ledger.component').then((m) => m.LedgerComponent) },
    ],
  },
  { path: 'verify', title: 'Verify · Sourcify', loadComponent: () => import('./features/verifier/verifier.component').then((m) => m.VerifierComponent) },
  { path: 'verify/:hash', title: 'Verify · Sourcify', loadComponent: () => import('./features/verifier/verifier.component').then((m) => m.VerifierComponent) },
  { path: '**', redirectTo: 'issuer/issue' },
];
