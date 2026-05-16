/**
 * Legacy GCS adapter shim.
 *
 * LearnPlay now standardizes on canonical local storage keys and the on-prem/local
 * object storage implementation for all deployments in this repo.
 *
 * This shim keeps old imports stable while routing behavior to canonical storage.
 */

import * as onPremMod from './objectStorage-onprem';

export const objectStorageClient = onPremMod.objectStorageClient;
export const ObjectNotFoundError = onPremMod.ObjectNotFoundError;
export const ObjectStorageService = onPremMod.ObjectStorageService;
export const parseObjectPath = onPremMod.parseObjectPath;
export const registerUploadRoutes = onPremMod.registerUploadRoutes;

export const pendingUploads = onPremMod.pendingUploads;
export const LocalFile = onPremMod.LocalFile;
