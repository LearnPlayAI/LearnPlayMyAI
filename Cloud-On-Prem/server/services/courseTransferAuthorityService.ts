import os from "os";
import { isOnPremMode } from "../featureFlags";
import { generateHardwareKey } from "./licenseCryptoService";
import {
  getEnterpriseCustomerIdFromConfig,
  getEnterpriseSystemIdFromConfig,
  getLocalServerBaseUrl,
  hydrateOnpremSyncCredentialFromConfig,
  postSignedOnpremJson,
} from "./onpremLicenseSyncService";
import type {
  CourseTransferSourceContext,
  ProtectedTransferDescriptor,
  SignedCourseTransferAuthorization,
  UnwrapTransferDataKeyParams,
} from "./courseTransferUtils";
import { unwrapCourseTransferDataKeyFromDescriptor } from "./courseTransferUtils";
import { parseOnpremSystemType } from "./onpremLicenseStatus";

const COURSE_TRANSFER_AUTHORITY_PRD_BASE_URL = "https://learnplay.co.za";

function normalizeOnpremSystemType(input: unknown): "development" | "qa" | "production" {
  return parseOnpremSystemType(String(input || "")) || "development";
}

async function buildOnpremTransferIdentity() {
  await hydrateOnpremSyncCredentialFromConfig();
  return {
    enterpriseCustomerId: await getEnterpriseCustomerIdFromConfig(),
    enterpriseSystemId: await getEnterpriseSystemIdFromConfig(),
    systemType: normalizeOnpremSystemType(process.env.SYSTEM_TYPE),
    hardwareKey: generateHardwareKey(),
    hostname: os.hostname(),
    serverBaseUrl: getLocalServerBaseUrl(),
  };
}

export async function authorizeCourseTransferExport(params: {
  organizationId: string;
  courseId: string;
  userId: string;
  manifestSummary?: Record<string, unknown>;
}): Promise<{
  sourceContext: CourseTransferSourceContext;
  exportAuthorization: SignedCourseTransferAuthorization | null;
  transferPublicKeyPem?: string | null;
  transferPublicKeyId?: string | null;
}> {
  if (!isOnPremMode()) {
    return {
      sourceContext: {
        variant: "cloud",
        organizationId: params.organizationId,
        courseId: params.courseId,
      },
      exportAuthorization: null,
    };
  }

  const identity = await buildOnpremTransferIdentity();
  const payload = {
    action: "export",
    organizationId: params.organizationId,
    courseId: params.courseId,
    requestedAt: new Date().toISOString(),
    sourceVariant: "onprem",
    ...identity,
    manifestSummary: params.manifestSummary || {},
  };
  const endpoint = `${COURSE_TRANSFER_AUTHORITY_PRD_BASE_URL}/api/enterprise/public/course-transfer/export-authorize`;
  const result = await postSignedOnpremJson(endpoint, payload);
  if (!result.response.ok || !result.data?.exportAuthorization) {
    throw new Error(
      `Course export requires an active Cloud PRD license. ${String(result.data?.error || result.data?.message || "Cloud authorization failed")}`,
    );
  }

  return {
    sourceContext: {
      variant: "onprem",
      organizationId: params.organizationId,
      courseId: params.courseId,
      enterpriseCustomerId: identity.enterpriseCustomerId,
      enterpriseSystemId: result.data.enterpriseSystemId || identity.enterpriseSystemId,
      systemType: identity.systemType,
      organizationIdentity: result.data.organizationIdentity || null,
    },
    exportAuthorization: result.data.exportAuthorization,
    transferPublicKeyPem: result.data.transferPublicKeyPem || null,
    transferPublicKeyId: result.data.transferPublicKeyId || null,
  };
}

export async function unwrapCourseTransferDataKeyForImport(params: UnwrapTransferDataKeyParams): Promise<Buffer> {
  if (!isOnPremMode()) {
    return unwrapCourseTransferDataKeyFromDescriptor(params.descriptor);
  }

  const identity = await buildOnpremTransferIdentity();
  const descriptor = params.descriptor as ProtectedTransferDescriptor;
  const endpoint = `${COURSE_TRANSFER_AUTHORITY_PRD_BASE_URL}/api/enterprise/public/course-transfer/decrypt-key`;
  const result = await postSignedOnpremJson(endpoint, {
    action: "import",
    requestedAt: new Date().toISOString(),
    targetVariant: "onprem",
    encryptedPayloadSha256: params.encryptedPayloadSha256,
    descriptor,
    ...identity,
  });

  if (!result.response.ok || !result.data?.dataKey) {
    throw new Error(
      `Package decrypt authorization failed. ${String(result.data?.error || result.data?.message || "Cloud PRD did not authorize this import")}`,
    );
  }

  return Buffer.from(String(result.data.dataKey), "base64");
}
