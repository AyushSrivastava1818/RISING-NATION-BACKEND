import { prisma } from '../src/repositories/prisma.js';
import { hashPassword } from '../src/utils/crypto.js';
import { config } from '../src/config/index.js';

export async function bootstrapAdmin(): Promise<{ created: boolean; email: string }> {
  const email = config.ADMIN_BOOTSTRAP_EMAIL;
  const password = config.ADMIN_BOOTSTRAP_PASSWORD;

  if (!email || !password) {
    throw new Error('ADMIN_BOOTSTRAP_EMAIL and ADMIN_BOOTSTRAP_PASSWORD must be configured');
  }

  if (password.length < 12) {
    throw new Error('ADMIN_BOOTSTRAP_PASSWORD must be at least 12 characters');
  }

  const existing = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (existing) {
    console.log(`Admin user ${email} already exists. Skipping bootstrap.`);
    return { created: false, email };
  }

  const passwordHash = await hashPassword(password);

  await prisma.user.create({
    data: {
      name: 'System Admin',
      email: email.toLowerCase(),
      password_hash: passwordHash,
      role: 'admin',
      growth_level: 'lead',
    },
  });

  console.log(`Admin user ${email} created successfully.`);
  return { created: true, email };
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`) {
  bootstrapAdmin()
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      console.error('Bootstrap failed:', err);
      process.exit(1);
    });
}
