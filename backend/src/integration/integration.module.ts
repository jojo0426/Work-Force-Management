import { Module } from '@nestjs/common';
import { IntegrationApprovalController } from './integration-approval.controller';
import { IntegrationController } from './integration.controller';
import { IntegrationService } from './integration.service';
import { IntegrationWorkerService } from './integration-worker.service';
import { IntegrationOrchestratorService } from './integration-orchestrator.service';
import { IntegrationExecutorService } from './integration-executor.service';
import { IntegrationPolicyService } from './integration-policy.service';
import { IntegrationFleetControlService } from './integration-fleet-control.service';
import { IntegrationHealthMetricsService } from './integration-health-metrics.service';
import { IntegrationAdapterRegistryService } from './integration-adapter-registry.service';
import { IntegrationAdapterLifecycleService } from './integration-adapter-lifecycle.service';
import { IntegrationMockReceiptIngestionService } from './integration-mock-receipt-ingestion.service';
import { IntegrationApprovalLedgerService } from './integration-approval-ledger.service';
import { IntegrationReconciliationService } from './integration-reconciliation.service';
import { PrismaService } from '../prisma.service';
import { AuthModule } from '../auth/auth.module';

@Module({ imports: [AuthModule], controllers: [IntegrationController, IntegrationApprovalController], providers: [IntegrationService, IntegrationWorkerService, IntegrationOrchestratorService, IntegrationExecutorService, IntegrationPolicyService, IntegrationFleetControlService, IntegrationReconciliationService, IntegrationApprovalLedgerService, IntegrationMockReceiptIngestionService, IntegrationHealthMetricsService, IntegrationAdapterRegistryService, IntegrationAdapterLifecycleService, PrismaService] })
export class IntegrationModule {}
