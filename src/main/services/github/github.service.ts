import { Octokit } from 'octokit';
import { LoggerService } from '../logger/logger.service';

export class GitHubService {
  /**
   * Request device code to start GitHub Device Flow
   */
  public static async requestDeviceCode(clientId: string): Promise<{
    device_code: string;
    user_code: string;
    verification_uri: string;
    interval: number;
    expires_in: number;
  }> {
    try {
      await LoggerService.info('GitHub Auth', 'Initiating Device Flow request');
      const response = await fetch('https://github.com/login/device/code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ client_id: clientId, scope: 'repo,user' })
      });

      if (!response.ok) {
        throw new Error(`Failed to request device code: ${response.statusText}`);
      }

      const data = await response.json() as any;
      return {
        device_code: data.device_code,
        user_code: data.user_code,
        verification_uri: data.verification_uri,
        interval: data.interval || 5,
        expires_in: data.expires_in
      };
    } catch (err) {
      await LoggerService.error('GitHub Auth Device Code Failed', (err as Error).stack);
      throw err;
    }
  }

  /**
   * Poll GitHub access token endpoint
   */
  public static async pollForToken(clientId: string, deviceCode: string, interval: number): Promise<string> {
    const pollUrl = 'https://github.com/login/oauth/access_token';
    const intervalMs = interval * 1000;
    
    return new Promise((resolve, reject) => {
      const intervalId = setInterval(async () => {
        try {
          const response = await fetch(pollUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            body: JSON.stringify({
              client_id: clientId,
              device_code: deviceCode,
              grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
            })
          });

          if (!response.ok) {
            clearInterval(intervalId);
            reject(new Error(`Polling failed: ${response.statusText}`));
            return;
          }

          const data = await response.json() as any;
          if (data.access_token) {
            clearInterval(intervalId);
            resolve(data.access_token);
          } else if (data.error === 'authorization_pending') {
            // Keep polling
          } else {
            clearInterval(intervalId);
            reject(new Error(data.error_description || data.error || 'Unknown authorization error'));
          }
        } catch (err) {
          clearInterval(intervalId);
          reject(err);
        }
      }, intervalMs);
    });
  }

  /**
   * Validates token by fetching user profile using Octokit.
   */
  public static async validateToken(token: string): Promise<{
    username: string;
    displayName: string;
    avatar: string;
    email: string;
  }> {
    try {
      const octokit = new Octokit({ auth: token });
      const { data: user } = await octokit.rest.users.getAuthenticated();
      
      let email = user.email || '';
      if (!email) {
        try {
          const { data: emails } = await octokit.rest.users.listEmailsForAuthenticatedUser();
          const primary = emails.find(e => e.primary);
          if (primary) email = primary.email;
        } catch {
          // Scopes might not support listing emails
        }
      }

      return {
        username: user.login,
        displayName: user.name || user.login,
        avatar: user.avatar_url || '',
        email: email
      };
    } catch (err) {
      await LoggerService.error('GitHub token validation failed', (err as Error).stack);
      throw err;
    }
  }

  /**
   * Creates a public or private GitHub repository.
   */
  public static async createRepository(
    token: string,
    name: string,
    description: string,
    isPrivate: boolean
  ): Promise<{ id: number; name: string; url: string; visibility: string }> {
    try {
      await LoggerService.info('GitHub Repo', `Creating repo: ${name}, private: ${isPrivate}`);
      const octokit = new Octokit({ auth: token });
      
      const { data: repo } = await octokit.rest.repos.createForAuthenticatedUser({
        name,
        description,
        private: isPrivate,
        auto_init: false
      });

      return {
        id: repo.id,
        name: repo.name,
        url: repo.clone_url,
        visibility: repo.private ? 'private' : 'public'
      };
    } catch (err) {
      await LoggerService.error('GitHub Repo creation failed', (err as Error).stack);
      throw err;
    }
  }
}
