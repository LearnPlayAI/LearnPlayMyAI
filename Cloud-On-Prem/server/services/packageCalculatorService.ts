/**
 * @deprecated This service has been refactored to packageProposalService.
 * All exports are re-exported from the new service for backward compatibility.
 * Please update your imports to use packageProposalService directly.
 */

import { packageProposalService, PackageProposalService } from './packageProposalService';

/**
 * @deprecated Use packageProposalService from './packageProposalService' instead.
 */
export const packageCalculatorService = packageProposalService;

/**
 * @deprecated Use PackageProposalService from './packageProposalService' instead.
 */
export const PackageCalculatorService = PackageProposalService;
