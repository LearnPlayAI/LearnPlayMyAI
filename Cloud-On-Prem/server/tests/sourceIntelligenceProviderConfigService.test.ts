import { describe, expect, it } from '@jest/globals';
import {
  buildGoogleOAuthAuthorizationUrl,
  summarizeCredential,
  summarizeGoogleOAuthCredential,
} from '../services/sourceIntelligenceProviderConfigService';

describe('source intelligence provider configuration', () => {
  it('summarizes service account credentials without exposing secrets', () => {
    const summary = summarizeCredential(JSON.stringify({
      type: 'service_account',
      project_id: 'learnplay-org-project',
      private_key_id: 'abcdef1234567890',
      private_key: '-----BEGIN PRIVATE KEY-----\nsecret\n-----END PRIVATE KEY-----\n',
      client_email: 'learnplay-notebooklm@example-project.iam.gserviceaccount.com',
      client_id: '1234567890',
    }));

    expect(summary).toEqual({
      type: 'service_account',
      projectId: 'learnplay-org-project',
      clientEmail: 'le***om',
      privateKeyId: 'ab***90',
    });
    expect(JSON.stringify(summary)).not.toContain('PRIVATE KEY');
    expect(JSON.stringify(summary)).not.toContain('secret');
    expect(JSON.stringify(summary)).not.toContain('learnplay-notebooklm@example-project.iam.gserviceaccount.com');
  });

  it('rejects invalid credential JSON before it can be stored', () => {
    expect(() => summarizeCredential('{not json')).toThrow();
  });

  it('builds a Google OAuth URL suitable for organization NotebookLM access', () => {
    const url = new URL(buildGoogleOAuthAuthorizationUrl({
      clientId: 'client-id.apps.googleusercontent.com',
      redirectUri: 'https://learnplay.example.com/api/org/source-intelligence/notebooklm/oauth/callback',
      state: 'state-token',
    }));

    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('include_granted_scopes')).toBe('true');
    expect(url.searchParams.get('prompt')).toBe('consent');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('state')).toBe('state-token');
    expect(url.searchParams.get('scope')).toContain('https://www.googleapis.com/auth/cloud-platform');
    expect(url.searchParams.get('scope')).toContain('openid');
    expect(url.searchParams.get('scope')).toContain('email');
  });

  it('summarizes Google OAuth credentials without exposing tokens', () => {
    const summary = summarizeGoogleOAuthCredential({
      access_token: 'ya29.secret-access-token',
      refresh_token: '1//secret-refresh-token',
      expires_in: 3599,
      scope: 'openid email https://www.googleapis.com/auth/cloud-platform',
      token_type: 'Bearer',
      connectedEmail: 'admin@example.com',
      projectOptions: [
        { projectId: 'learnplay-demo', projectNumber: '123456789012', name: 'LearnPlay Demo' },
      ],
    });

    expect(summary).toEqual({
      type: 'google_oauth',
      connectedEmail: 'ad***om',
      scopes: ['openid', 'email', 'https://www.googleapis.com/auth/cloud-platform'],
      projectCount: 1,
    });
    expect(JSON.stringify(summary)).not.toContain('secret-access-token');
    expect(JSON.stringify(summary)).not.toContain('secret-refresh-token');
    expect(JSON.stringify(summary)).not.toContain('admin@example.com');
  });
});
