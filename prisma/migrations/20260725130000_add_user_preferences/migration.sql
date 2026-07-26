-- CreateTable
CREATE TABLE "user_preferences" (
    "sub" TEXT NOT NULL,
    "translationId" INTEGER NOT NULL,
    "languageIso" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("sub")
);
