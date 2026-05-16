/**
 * objectStorage.ts — Storage mode router
 *
 * LearnPlay standard is local filesystem storage for all deployments.
 * This module hard-forces local backend to prevent accidental cloud-storage
 * usage after platform migration.
 */

import * as onPremMod from './objectStorage-onprem';
const mod = onPremMod;

export const objectStorageClient  = mod.objectStorageClient;
export const ObjectNotFoundError  = mod.ObjectNotFoundError;
export const ObjectStorageService = mod.ObjectStorageService;
export const parseObjectPath      = mod.parseObjectPath;
export const registerUploadRoutes = mod.registerUploadRoutes;

export const pendingUploads = mod.pendingUploads;
export const LocalFile      = mod.LocalFile;
