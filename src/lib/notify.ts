import { prisma } from "./prisma";

export async function notify(params: {
  userId: string;
  type: string;
  title: string;
  message: string;
  link?: string;
}) {
  return prisma.notification.create({ data: params });
}
