import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function saveContactMessage(
    email: string,
    message: string
) {
    return prisma.contact.upsert({
        where: {
            email,
        },
        create: {
            email,
            message,
        },
        update: {
            message,
        },
    });
}