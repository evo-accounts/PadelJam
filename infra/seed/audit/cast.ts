// infra/seed/audit/cast.ts
// Every account the seed owns. Keys are stable identifiers used by the other modules and the
// manifest. Phones are unique E.164 numbers in a reserved range so fixed test codes can be
// registered for them on the hosted project.
export type Person = {
  key: string;
  email: string;
  phone: string;
  name: string;
  gender: 'male' | 'female';
  avatar: boolean;
  /** What the auditor logs into this account for, if anything. */
  acting?: string;
  bio?: string;
  location: string;
};

export const PASSWORD = 'Padel1234#';

const phone = (n: number) => `+3519100${String(n).padStart(5, '0')}`;

export const A1: Person = {
  key: 'a1', email: 'user@padeljam.com', phone: phone(100), name: 'João Malaggi', gender: 'male', avatar: true,
  bio: 'Left-side player, weeknight regular. Organizing the Tuesday league since 2025.', location: 'Lisboa, PT',
};
/** Never created by the seed. Purged if present so the auditor always signs up fresh. */
export const A2: Person = {
  key: 'a2', email: 'newuser@padeljam.com', phone: phone(101), name: 'New User', gender: 'male', avatar: false, location: 'Lisboa, PT',
};

const sup = (key: string, name: string, gender: Person['gender'], n: number, over: Partial<Person> = {}): Person => ({
  key, name, gender, phone: phone(n), email: `audit-${key}@padeljam.com`, avatar: true, location: 'Lisboa, PT', ...over,
});

export const NAMED: Person[] = [
  sup('u1a', 'Nuno Reis', 'male', 110, { avatar: false }),
  sup('u1b', 'Inês Matos', 'female', 111, { avatar: false, location: 'Porto, PT' }),
  sup('u1c', 'Vasco Pinto', 'male', 112, { avatar: false }),
  sup('u2', 'Maria Madalena Albuquerque de Sousa Ferreira Cabral', 'female', 113, { location: 'Cascais, PT' }),
  sup('u3', 'Q', 'male', 114),
  sup('u4', 'Diogo Antunes', 'male', 115, { location: 'Cascais, PT', bio: 'Twenty-plus events a season. Right side, right hand.' }),
  sup('u5', 'Leonor Brito', 'female', 116, { bio: undefined }),
  sup('u6', 'Tomás Ribeiro', 'male', 117),
  sup('u7', 'Rui Trindade', 'male', 118, { location: 'Sintra, PT' }),
  sup('f1', 'Miguel Carvalho', 'male', 119, { location: 'Porto, PT', acting: 'Owner of C2 and organizer of E6 (watch the waiting-list spot release)' }),
  sup('f2', 'Beatriz Nogueira', 'female', 120, { location: 'Cascais, PT' }),
  sup('f3', 'Carlos Mendes', 'male', 121, { location: 'Sintra, PT', acting: 'Owner of C4 and organizer of E7' }),
  sup('f4', 'Ana Rocha', 'female', 122, { acting: 'Second admin of C1, organizer of E8 (change its date live for N6)' }),
  sup('f5', 'Diogo Fonseca', 'male', 123, { acting: 'Confirmed in E2 and E6: submit a score (lock) or leave E6 (spot release)' }),
  sup('f6', 'Sara Lima', 'female', 124),
  sup('f7', 'Joana Freitas', 'female', 125, { acting: 'Interested in E7, sent A1 the partner request (N10)' }),
  sup('f8', 'Marta Silva', 'female', 126),
];

const crowdNames = [
  ['Pedro Amaral', 'male'], ['Rita Correia', 'female'], ['Hugo Batista', 'male'], ['Catarina Neves', 'female'],
  ['Filipe Sousa', 'male'], ['Teresa Gomes', 'female'], ['André Faria', 'male'], ['Helena Duarte', 'female'],
  ['Ricardo Pires', 'male'], ['Cláudia Melo', 'female'], ['Gonçalo Tavares', 'male'], ['Patrícia Antunes', 'female'],
  ['Luís Barros', 'male'],
] as const;
export const CROWD: Person[] = crowdNames.map(([name, gender], i) =>
  sup(`c${String(i + 1).padStart(2, '0')}`, name, gender, 130 + i, { location: ['Lisboa, PT', 'Porto, PT', 'Cascais, PT'][i % 3] }),
);

export const SUPPORTING: Person[] = [...NAMED, ...CROWD];
export const ALL: Person[] = [A1, ...SUPPORTING];
/** Emails the purge owns. A2 included: it must not exist when the auditor starts. */
export const ALL_EMAILS: string[] = [A1.email, A2.email, ...SUPPORTING.map((p) => p.email)];

export function byKey(key: string): Person {
  const p = ALL.find((x) => x.key === key);
  if (!p) throw new Error(`no cast member ${key}`);
  return p;
}
