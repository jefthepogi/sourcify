/** Fictional demo directory. Mapped to the local dev chain's accounts by position (#0, #1, …). Not real people. */
export interface DemoProfile { name: string; username: string; title: string }

export const DEMO_PROFILES: DemoProfile[] = [
  { name: 'Dr. Elena Marquez', username: 'elena.marquez', title: 'University Registrar' },
  { name: 'Prof. Kenji Watanabe', username: 'k.watanabe', title: 'Dean, Faculty of Science' },
  { name: 'Amira Haddad', username: 'a.haddad', title: 'Extension Programs Office' },
  { name: 'Samuel Okoye', username: 's.okoye', title: 'Graduate School' },
  { name: 'Dr. Priya Raman', username: 'p.raman', title: 'Research & Innovation Office' },
  { name: 'Lucas Ferreira', username: 'l.ferreira', title: 'Continuing Education' },
  { name: 'Ingrid Nilsson', username: 'i.nilsson', title: 'Student Records' },
  { name: 'Tomás Herrera', username: 't.herrera', title: 'Laboratory Safety Office' },
  { name: 'Fatima Zahra', username: 'f.zahra', title: 'Library Services' },
  { name: 'Noah Bennett', username: 'n.bennett', title: 'Admissions Desk' },
];
