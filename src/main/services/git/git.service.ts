import { exec } from 'child_process';
import simpleGit, { SimpleGit } from 'simple-git';
import fs from 'fs';
import path from 'path';
import { LoggerService } from '../logger/logger.service';

export class GitService {
  /**
   * Checks if Git is installed on the system path.
   */
  public static async isGitInstalled(): Promise<boolean> {
    return new Promise((resolve) => {
      exec('git --version', (err) => {
        resolve(!err);
      });
    });
  }

  private static getGit(projectPath: string): SimpleGit {
    return simpleGit(projectPath);
  }
  
  /**
   * Initializes git repository inside a folder.
   * If it fails, rolls back the folder if it wasn't a git repo before.
   */
  public static async initProject(projectPath: string): Promise<boolean> {
    const git = this.getGit(projectPath);
    const gitFolder = path.join(projectPath, '.git');
    const existed = fs.existsSync(gitFolder);

    try {
      await git.init();
      await LoggerService.info('Git Init', `Initialized Git repo at ${projectPath}`);
      return true;
    } catch (err) {
      await LoggerService.error('Git Init Failed', (err as Error).stack);
      if (!existed && fs.existsSync(gitFolder)) {
        try {
          fs.rmSync(gitFolder, { recursive: true, force: true });
        } catch (rmErr) {
          console.error('Failed to clean up .git directory during rollback:', rmErr);
        }
      }
      throw err;
    }
  }

  /**
   * Adds all files, commits, and pushes to a remote GitHub URL.
   * Includes complete rollback support if push fails.
   */
  public static async commitAndPush(
    projectPath: string,
    repoUrl: string,
    token: string,
    message: string = 'Initial commit from Publisher Pro'
  ): Promise<string> {
    const git = this.getGit(projectPath);
    
    // Ensure origin remote is configured
    let remoteAdded = false;
    const authedUrl = repoUrl.replace('https://', `https://${token}@`);

    try {
      const remotes = await git.getRemotes(true);
      const origin = remotes.find(r => r.name === 'origin');

      if (origin) {
        await git.remote(['set-url', 'origin', authedUrl]);
      } else {
        await git.addRemote('origin', authedUrl);
        remoteAdded = true;
      }
    } catch (err) {
      throw new Error(`Failed to configure git remote: ${(err as Error).message}`);
    }

    let isCommitted = false;
    let previousHead: string | null = null;

    try {
      try {
        previousHead = await git.revparse(['HEAD']);
      } catch {
        // Fresh repository
      }

      await git.add('.');

      const status = await git.status();
      if (status.files.length > 0) {
        await git.commit(message);
        isCommitted = true;
      }

      let branchName = 'main';
      try {
        const branches = await git.branchLocal();
        if (branches.current) {
          branchName = branches.current;
        } else {
          await git.branch(['-M', 'main']);
          branchName = 'main';
        }
      } catch {
        await git.branch(['-M', 'main']);
        branchName = 'main';
      }

      await git.push('origin', branchName, ['-u']);
      
      // Clean up remote URL to not include token in the local git config
      await git.remote(['set-url', 'origin', repoUrl]);

      const hash = await git.revparse(['HEAD']);
      await LoggerService.info('Git Push Success', `Pushed successfully. HEAD: ${hash}`);
      return hash;
    } catch (err) {
      await LoggerService.error('Git Push Failed, rolling back', (err as Error).stack);

      try {
        await git.remote(['set-url', 'origin', repoUrl]);
      } catch {}

      if (isCommitted) {
        try {
          if (previousHead) {
            await git.reset(['--soft', previousHead]);
          } else {
            await git.reset(['--mixed']);
          }
          await LoggerService.info('Git Rollback', 'Successfully rolled back commit');
        } catch (rollErr) {
          await LoggerService.error('Git Rollback Failed', (rollErr as Error).stack);
        }
      }

      throw err;
    }
  }

  /**
   * Pulls code from remote GitHub repo. Resets conflicts to previous state on failure.
   */
  public static async pull(projectPath: string, repoUrl: string, token: string): Promise<boolean> {
    const git = this.getGit(projectPath);
    const authedUrl = repoUrl.replace('https://', `https://${token}@`);
    
    let currentHead: string | null = null;
    try {
      currentHead = await git.revparse(['HEAD']);
    } catch {}

    try {
      await git.remote(['set-url', 'origin', authedUrl]);
      
      let branchName = 'main';
      try {
        const branchLocal = await git.branchLocal();
        branchName = branchLocal.current || 'main';
      } catch {}

      await git.pull('origin', branchName);
      
      await git.remote(['set-url', 'origin', repoUrl]);
      return true;
    } catch (err) {
      await LoggerService.error('Git Pull Failed, resetting', (err as Error).stack);
      
      try {
        await git.remote(['set-url', 'origin', repoUrl]);
      } catch {}

      if (currentHead) {
        try {
          try {
            await git.merge(['--abort']);
          } catch {}
          await git.reset(['--hard', currentHead]);
          await LoggerService.info('Git Pull Rollback', `Successfully rolled back to ${currentHead}`);
        } catch (rollErr) {
          await LoggerService.error('Git Pull Rollback Failed', (rollErr as Error).stack);
        }
      }
      throw err;
    }
  }
}
