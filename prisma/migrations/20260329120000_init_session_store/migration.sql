-- CreateTable
CREATE TABLE "pkce_states" (
    "extState" TEXT NOT NULL,
    "oauthState" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "codeVerifier" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pkce_states_pkey" PRIMARY KEY ("extState")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "sub" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "accessTokenExpiresAt" BIGINT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ext_state_sessions" (
    "extState" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "session" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ext_state_sessions_pkey" PRIMARY KEY ("extState")
);

-- CreateIndex
CREATE INDEX "sessions_expiresAt_idx" ON "sessions"("expiresAt");

-- CreateIndex
CREATE INDEX "pkce_states_expiresAt_idx" ON "pkce_states"("expiresAt");

-- CreateIndex
CREATE INDEX "ext_state_sessions_expiresAt_idx" ON "ext_state_sessions"("expiresAt");
