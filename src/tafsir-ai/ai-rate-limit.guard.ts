import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/session-auth.guard';
import { PrismaService } from '../prisma/prisma.service';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const HOURLY_LIMIT = 10;
const DAILY_LIMIT = 30;

@Injectable()
export class AiRateLimitGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const sub = req.sessionData?.sub;

    if (!sub) {
      throw new HttpException('Authentication required', HttpStatus.UNAUTHORIZED);
    }

    const now = new Date();
    const hourAgo = new Date(now.getTime() - HOUR_MS);
    const dayAgo = new Date(now.getTime() - DAY_MS);

    await this.prisma.aiUsageLog.deleteMany({
      where: { createdAt: { lt: dayAgo } },
    });

    const hourlyCount = await this.prisma.aiUsageLog.count({
      where: { sub, createdAt: { gte: hourAgo } },
    });

    if (hourlyCount >= HOURLY_LIMIT) {
      throw new HttpException(
        'AI usage limit reached. Try again in an hour.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const dailyCount = await this.prisma.aiUsageLog.count({
      where: { sub, createdAt: { gte: dayAgo } },
    });

    if (dailyCount >= DAILY_LIMIT) {
      throw new HttpException(
        'Daily AI usage limit reached. Try again tomorrow.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    await this.prisma.aiUsageLog.create({ data: { sub } });

    return true;
  }
}
