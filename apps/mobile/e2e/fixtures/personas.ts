/** Mirrors infra/seed/seed-e2e.mjs — keep in sync. All passwords are `demo1234`. */
export const PASSWORD = 'demo1234';

export type PersonaKey =
  | 'alex' | 'maria' | 'joao' | 'sofia' | 'bruno' | 'rita' | 'pedro'
  | 'nina' | 'tiago' | 'carla' | 'dora' | 'omar';

export interface Persona {
  email: string;
  phone: string;
  name: string;
}

export const PERSONAS: Record<PersonaKey, Persona> = {
  alex:  { email: 'demo@padeljam.test',  phone: '+351910000001', name: 'Alex Organizer' },
  maria: { email: 'maria@padeljam.test', phone: '+351910000002', name: 'Maria Santos' },
  joao:  { email: 'joao@padeljam.test',  phone: '+351910000003', name: 'João Pereira' },
  sofia: { email: 'sofia@padeljam.test', phone: '+351910000004', name: 'Sofia Costa' },
  bruno: { email: 'bruno@padeljam.test', phone: '+351910000005', name: 'Bruno Almeida' },
  rita:  { email: 'rita@padeljam.test',  phone: '+351910000006', name: 'Rita Fernandes' },
  pedro: { email: 'pedro@padeljam.test', phone: '+351910000007', name: 'Pedro Lopes' },
  nina:  { email: 'nina@padeljam.test',  phone: '+351910000008', name: 'Nina Privada' },
  tiago: { email: 'tiago@padeljam.test', phone: '+351910000009', name: 'Tiago Reviews' },
  carla: { email: 'carla@padeljam.test', phone: '+351910000010', name: 'Carla Solo' },
  dora:  { email: 'dora@padeljam.test',  phone: '+351910000011', name: 'Dora Descartável' },
  omar:  { email: 'omar@padeljam.test',  phone: '+351910000012', name: 'Omar Novato' },
};

/** GoTrue test-OTP number (config.toml [auth.sms.test_otp]) — code is always 123456. */
export const TEST_PHONE = '+351912345678';
export const TEST_PHONE_OTP = '123456';
