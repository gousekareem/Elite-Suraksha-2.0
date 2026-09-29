-- EliteSuraksha 2.0: replace the parametric-insurance domain (policies, claims,
-- payouts, trigger events, risk snapshots) with the earnings-intelligence and
-- investigation domain. users and otp_requests are preserved.
-- NOTE: worker_profiles is recreated with a new shape; existing profile rows are dropped.

-- DropForeignKey
ALTER TABLE "worker_documents" DROP CONSTRAINT "worker_documents_workerProfileId_fkey";
ALTER TABLE "policies" DROP CONSTRAINT "policies_workerProfileId_fkey";
ALTER TABLE "claims" DROP CONSTRAINT "claims_workerProfileId_fkey";
ALTER TABLE "claims" DROP CONSTRAINT "claims_policyId_fkey";
ALTER TABLE "claims" DROP CONSTRAINT "claims_triggerEventId_fkey";
ALTER TABLE "payouts" DROP CONSTRAINT "payouts_workerProfileId_fkey";
ALTER TABLE "payouts" DROP CONSTRAINT "payouts_claimId_fkey";
ALTER TABLE "risk_snapshots" DROP CONSTRAINT "risk_snapshots_workerProfileId_fkey";
ALTER TABLE "location_logs" DROP CONSTRAINT "location_logs_workerProfileId_fkey";
ALTER TABLE "worker_profiles" DROP CONSTRAINT "worker_profiles_userId_fkey";

-- DropTable
DROP TABLE "worker_documents";
DROP TABLE "policies";
DROP TABLE "trigger_events";
DROP TABLE "claims";
DROP TABLE "payouts";
DROP TABLE "risk_snapshots";
DROP TABLE "location_logs";
DROP TABLE "worker_profiles";

-- DropEnum
DROP TYPE "KycStatus";
DROP TYPE "EmploymentStatus";
DROP TYPE "PolicyStatus";
DROP TYPE "ClaimStatus";
DROP TYPE "PayoutStatus";
DROP TYPE "TriggerType";
DROP TYPE "DocumentType";
DROP TYPE "ReviewStatus";

-- CreateEnum
CREATE TYPE "TripStatus" AS ENUM ('COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PlatformEventType" AS ENUM ('INCENTIVE_TERMS_CHANGE', 'PAY_RATE_CHANGE', 'DEDUCTION_POLICY_CHANGE', 'ZONE_CHANGE', 'APP_OUTAGE', 'ACCOUNT_NOTICE', 'OTHER');

-- CreateEnum
CREATE TYPE "AnomalySeverity" AS ENUM ('NORMAL', 'WATCH', 'SIGNIFICANT_CHANGE', 'INVESTIGATION_RECOMMENDED');

-- CreateEnum
CREATE TYPE "InvestigationStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'AWAITING_CLARIFICATION', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "EvidenceType" AS ENUM ('EARNINGS_RECORD', 'BASELINE', 'COMPARABLE_SESSIONS', 'PLATFORM_EVENT', 'HINDSIGHT_MEMORY', 'PREVIOUS_INVESTIGATION', 'WORKER_STATEMENT', 'ATTACHMENT');

-- CreateEnum
CREATE TYPE "FindingKind" AS ENUM ('FACT', 'INFERENCE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('DRAFT', 'FINAL');

-- CreateEnum
CREATE TYPE "MemoryOperation" AS ENUM ('RETAIN', 'RECALL', 'DELETE_BANK');

-- CreateEnum
CREATE TYPE "MemoryEventStatus" AS ENUM ('OK', 'EMPTY', 'DUPLICATE_SKIPPED', 'UNAVAILABLE', 'FAILED', 'DISABLED');

-- CreateTable
CREATE TABLE "worker_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "zone" TEXT NOT NULL,
    "platformCode" TEXT NOT NULL,
    "platformName" TEXT NOT NULL,
    "preferences" JSONB,
    "isSynthetic" BOOLEAN NOT NULL DEFAULT false,
    "asOfDate" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "worker_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_sessions" (
    "id" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "externalRef" TEXT NOT NULL,
    "localDate" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startHour" INTEGER NOT NULL,
    "endHour" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3) NOT NULL,
    "zone" TEXT NOT NULL,
    "platformCode" TEXT NOT NULL,
    "activeMinutes" INTEGER NOT NULL,
    "idleMinutes" INTEGER NOT NULL,
    "ordersOffered" INTEGER NOT NULL,
    "ordersAccepted" INTEGER NOT NULL,
    "ordersCompleted" INTEGER NOT NULL,
    "ordersCancelled" INTEGER NOT NULL,
    "distanceKm" DECIMAL(8,2) NOT NULL,
    "acceptanceRate" DECIMAL(5,2) NOT NULL,
    "rating" DECIMAL(3,2),
    "zoneBreakdown" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_records" (
    "id" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL,
    "zone" TEXT NOT NULL,
    "distanceKm" DECIMAL(6,2) NOT NULL,
    "basePay" DECIMAL(10,2) NOT NULL,
    "status" "TripStatus" NOT NULL,

    CONSTRAINT "trip_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "earnings_records" (
    "id" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "basePay" DECIMAL(10,2) NOT NULL,
    "tips" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "incentiveProgram" TEXT,
    "incentiveEligible" BOOLEAN,
    "incentiveAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "incentiveNote" TEXT,
    "deductionAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "deductionBreakdown" JSONB,
    "grossEarnings" DECIMAL(10,2) NOT NULL,
    "netEarnings" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "earnings_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_events" (
    "id" TEXT NOT NULL,
    "workerId" TEXT,
    "platformCode" TEXT NOT NULL,
    "zone" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "localDate" TEXT NOT NULL,
    "type" "PlatformEventType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "externalRef" TEXT,
    "isSynthetic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "worker_baselines" (
    "id" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "segmentKey" TEXT NOT NULL,
    "windowStart" TEXT NOT NULL,
    "windowEnd" TEXT NOT NULL,
    "sampleSize" INTEGER NOT NULL,
    "metrics" JSONB NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "worker_baselines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anomalies" (
    "id" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "localDate" TEXT NOT NULL,
    "segmentKey" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "baselineValue" DECIMAL(10,2) NOT NULL,
    "observedValue" DECIMAL(10,2) NOT NULL,
    "deviationPct" DECIMAL(6,2) NOT NULL,
    "severity" "AnomalySeverity" NOT NULL,
    "signals" JSONB NOT NULL,
    "explanation" TEXT NOT NULL,
    "memoryRetained" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "anomalies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investigations" (
    "id" TEXT NOT NULL,
    "caseNumber" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "anomalyId" TEXT,
    "status" "InvestigationStatus" NOT NULL DEFAULT 'OPEN',
    "title" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "periodStart" TEXT NOT NULL,
    "periodEnd" TEXT NOT NULL,
    "summary" TEXT,
    "analysis" JSONB,
    "memoryContext" JSONB,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "investigations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence_items" (
    "id" TEXT NOT NULL,
    "investigationId" TEXT NOT NULL,
    "type" "EvidenceType" NOT NULL,
    "source" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3),
    "localDate" TEXT,
    "title" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "relevance" TEXT NOT NULL,
    "refId" TEXT,
    "fileUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evidence_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investigation_findings" (
    "id" TEXT NOT NULL,
    "investigationId" TEXT NOT NULL,
    "kind" "FindingKind" NOT NULL,
    "statement" TEXT NOT NULL,
    "evidenceIds" TEXT[],
    "confidence" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "investigation_findings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grievance_reports" (
    "id" TEXT NOT NULL,
    "investigationId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'DRAFT',
    "requestedAction" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "markdown" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grievance_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investigation_outcomes" (
    "id" TEXT NOT NULL,
    "investigationId" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "rootCauseCategory" TEXT NOT NULL,
    "actionTaken" TEXT NOT NULL,
    "resolutionSource" TEXT NOT NULL,
    "workerFeedback" TEXT,
    "learning" TEXT,
    "resolvedAt" TIMESTAMP(3) NOT NULL,
    "memoryDocumentId" TEXT,
    "memoryRetainedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "investigation_outcomes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_interactions" (
    "id" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "userId" TEXT,
    "question" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "intent" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "toolsUsed" JSONB NOT NULL,
    "memoryRecalled" JSONB NOT NULL,
    "memoryStatus" TEXT NOT NULL,
    "reasoningEngine" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_interactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memory_events" (
    "id" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "bankId" TEXT NOT NULL,
    "operation" "MemoryOperation" NOT NULL,
    "status" "MemoryEventStatus" NOT NULL,
    "category" TEXT,
    "documentId" TEXT,
    "query" TEXT,
    "contentHash" TEXT,
    "contentPreview" TEXT,
    "localDate" TEXT,
    "reason" TEXT NOT NULL,
    "resultCount" INTEGER,
    "results" JSONB,
    "investigationId" TEXT,
    "interactionId" TEXT,
    "error" TEXT,
    "latencyMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memory_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "workerId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "worker_profiles_userId_key" ON "worker_profiles"("userId");

-- CreateIndex
CREATE INDEX "work_sessions_workerId_localDate_idx" ON "work_sessions"("workerId", "localDate");

-- CreateIndex
CREATE UNIQUE INDEX "work_sessions_workerId_externalRef_key" ON "work_sessions"("workerId", "externalRef");

-- CreateIndex
CREATE INDEX "trip_records_sessionId_idx" ON "trip_records"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "earnings_records_sessionId_key" ON "earnings_records"("sessionId");

-- CreateIndex
CREATE INDEX "earnings_records_workerId_idx" ON "earnings_records"("workerId");

-- CreateIndex
CREATE INDEX "platform_events_workerId_localDate_idx" ON "platform_events"("workerId", "localDate");

-- CreateIndex
CREATE INDEX "platform_events_platformCode_localDate_idx" ON "platform_events"("platformCode", "localDate");

-- CreateIndex
CREATE UNIQUE INDEX "worker_baselines_workerId_segmentKey_windowEnd_key" ON "worker_baselines"("workerId", "segmentKey", "windowEnd");

-- CreateIndex
CREATE UNIQUE INDEX "anomalies_sessionId_key" ON "anomalies"("sessionId");

-- CreateIndex
CREATE INDEX "anomalies_workerId_localDate_idx" ON "anomalies"("workerId", "localDate");

-- CreateIndex
CREATE UNIQUE INDEX "investigations_caseNumber_key" ON "investigations"("caseNumber");

-- CreateIndex
CREATE INDEX "investigations_workerId_createdAt_idx" ON "investigations"("workerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "evidence_items_investigationId_type_refId_key" ON "evidence_items"("investigationId", "type", "refId");

-- CreateIndex
CREATE INDEX "investigation_findings_investigationId_idx" ON "investigation_findings"("investigationId");

-- CreateIndex
CREATE UNIQUE INDEX "grievance_reports_investigationId_version_key" ON "grievance_reports"("investigationId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "investigation_outcomes_investigationId_key" ON "investigation_outcomes"("investigationId");

-- CreateIndex
CREATE INDEX "agent_interactions_workerId_createdAt_idx" ON "agent_interactions"("workerId", "createdAt");

-- CreateIndex
CREATE INDEX "memory_events_workerId_createdAt_idx" ON "memory_events"("workerId", "createdAt");

-- CreateIndex
CREATE INDEX "memory_events_workerId_documentId_idx" ON "memory_events"("workerId", "documentId");

-- CreateIndex
CREATE INDEX "audit_logs_workerId_createdAt_idx" ON "audit_logs"("workerId", "createdAt");

-- AddForeignKey
ALTER TABLE "worker_profiles" ADD CONSTRAINT "worker_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_sessions" ADD CONSTRAINT "work_sessions_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "worker_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_records" ADD CONSTRAINT "trip_records_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "worker_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_records" ADD CONSTRAINT "trip_records_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "work_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "earnings_records" ADD CONSTRAINT "earnings_records_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "worker_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "earnings_records" ADD CONSTRAINT "earnings_records_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "work_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_events" ADD CONSTRAINT "platform_events_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "worker_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worker_baselines" ADD CONSTRAINT "worker_baselines_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "worker_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anomalies" ADD CONSTRAINT "anomalies_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "worker_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anomalies" ADD CONSTRAINT "anomalies_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "work_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investigations" ADD CONSTRAINT "investigations_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "worker_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investigations" ADD CONSTRAINT "investigations_anomalyId_fkey" FOREIGN KEY ("anomalyId") REFERENCES "anomalies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_items" ADD CONSTRAINT "evidence_items_investigationId_fkey" FOREIGN KEY ("investigationId") REFERENCES "investigations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investigation_findings" ADD CONSTRAINT "investigation_findings_investigationId_fkey" FOREIGN KEY ("investigationId") REFERENCES "investigations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grievance_reports" ADD CONSTRAINT "grievance_reports_investigationId_fkey" FOREIGN KEY ("investigationId") REFERENCES "investigations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investigation_outcomes" ADD CONSTRAINT "investigation_outcomes_investigationId_fkey" FOREIGN KEY ("investigationId") REFERENCES "investigations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_interactions" ADD CONSTRAINT "agent_interactions_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "worker_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memory_events" ADD CONSTRAINT "memory_events_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "worker_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
