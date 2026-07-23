import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly pool: Pool | null;

  constructor() {
    const databaseUrl = process.env.DATABASE_URL?.trim();

    if (!databaseUrl) {
      super();
      this.pool = null;
      return;
    }

    const pool = new Pool({ connectionString: databaseUrl });
    super({ adapter: new PrismaPg(pool) });
    this.pool = pool;
  }

  async onModuleInit(): Promise<void> {
    if (!this.pool) {
      return;
    }

    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.pool) {
      await this.$disconnect();
      await this.pool.end();
    }
  }
}
