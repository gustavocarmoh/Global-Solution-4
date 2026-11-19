import * as fs from 'fs';
import * as path from 'path';
import { BASE_USERS, seedPassword } from './seed-users';

const DEFAULT_PASSWORD = 'Senha@123';

/** Garante que docs/USUARIOS-SEED.md descreve exatamente as contas que o seed cria. */
describe('docs/USUARIOS-SEED.md', () => {
  const doc = fs.readFileSync(
    path.resolve(__dirname, '../../../../../docs/USUARIOS-SEED.md'),
    'utf8',
  );

  it('tem um usuário de cada tipo, com nome, e-mail, telefone e papel corretos', () => {
    expect(new Set(BASE_USERS.map((u) => u.role)).size).toBe(BASE_USERS.length);
    expect(BASE_USERS).toHaveLength(5);
    for (const u of BASE_USERS) {
      const row = doc.split('\n').find((l) => l.includes(`\`${u.email}\``));
      expect(row).toBeDefined();
      expect(row).toContain(u.name);
      expect(row).toContain(u.phone);
      expect(row).toContain(`\`${u.role}\``);
      if (u.department) expect(row).toContain(u.department);
      // A senha padrão do seed aparece na linha de cada usuário
      expect(row).toContain(`\`${DEFAULT_PASSWORD}\``);
    }
  });

  it('a senha documentada é a que o seed realmente usa', () => {
    const previous = process.env.SEED_USERS_PASSWORD;
    delete process.env.SEED_USERS_PASSWORD;
    try {
      expect(seedPassword()).toBe(DEFAULT_PASSWORD);
    } finally {
      if (previous !== undefined) process.env.SEED_USERS_PASSWORD = previous;
    }
  });

  it('lista todos os e-mails criados pelo seed completo', () => {
    const seedSource =
      fs.readFileSync(path.resolve(__dirname, 'run-seed.ts'), 'utf8') +
      fs.readFileSync(path.resolve(__dirname, 'seed-users.ts'), 'utf8');
    const emails = new Set(seedSource.match(/[\w.]+@[\w.]+\.(?:gov\.br|com\.br)/g));
    expect(emails.size).toBeGreaterThanOrEqual(10);
    for (const email of emails) {
      const row = doc.split('\n').find((l) => l.includes(`\`${email}\``));
      expect(row).toBeDefined();
      expect(row).toContain(`\`${DEFAULT_PASSWORD}\``);
    }
  });
});
