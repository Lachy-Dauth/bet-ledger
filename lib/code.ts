import { prisma } from "./db";

// No ambiguous letters (no I/O) to make codes easy to read and share aloud.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";

function randomCode(len = 6): string {
  let out = "";
  for (let i = 0; i < len; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

/** Generate a 6-letter code that isn't already taken. */
export async function uniqueGroupCode(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = randomCode();
    const existing = await prisma.group.findUnique({ where: { code } });
    if (!existing) return code;
  }
  throw new Error("Could not generate a unique group code");
}
