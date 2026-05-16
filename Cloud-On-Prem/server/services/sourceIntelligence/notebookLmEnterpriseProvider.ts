import { SourceIntelligenceProviderConfigService } from "../sourceIntelligenceProviderConfigService";

export interface SourceIntelligenceRequest {
  organizationId: string;
  sourceDocumentIds: string[];
  selectedSectionIds: string[];
  desiredLessonCount?: number;
}

export interface SourceIntelligenceLesson {
  title: string;
  sourceGroundedText: string;
  sourceDocumentIds: string[];
  linkedAssetHints: Array<{
    pageOrSlide?: number;
    caption?: string;
    reason?: string;
  }>;
}

export interface SourceIntelligenceResult {
  provider: "notebooklm_enterprise";
  status: "unsupported";
  message: string;
  lessons: SourceIntelligenceLesson[];
}

export class NotebookLmEnterpriseProvider {
  async extractLessonMaterial(request: SourceIntelligenceRequest): Promise<SourceIntelligenceResult> {
    const summary = await SourceIntelligenceProviderConfigService.getNotebookLmSummary(request.organizationId);
    if (!summary.enabled || !summary.credentialConfigured) {
      return {
        provider: "notebooklm_enterprise",
        status: "unsupported",
        message: "NotebookLM Enterprise is not enabled with credentials for this organization.",
        lessons: [],
      };
    }

    return {
      provider: "notebooklm_enterprise",
      status: "unsupported",
      message: "NotebookLM Enterprise notebook/source APIs are configured, but Google has not exposed a stable structured lesson extraction API for LearnPlay to call. Native extraction remains the active course-builder path until that capability is available.",
      lessons: [],
    };
  }
}
