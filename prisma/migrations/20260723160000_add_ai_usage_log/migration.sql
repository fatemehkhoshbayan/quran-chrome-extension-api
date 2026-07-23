-- CreateTable
CREATE TABLE "ai_usage_log" (
    "id" TEXT NOT NULL,
    "sub" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_usage_log_sub_createdAt_idx" ON "ai_usage_log"("sub", "createdAt");
