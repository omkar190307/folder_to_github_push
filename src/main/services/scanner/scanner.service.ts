import fs from 'fs';
import path from 'path';
import { getPrismaClient } from '../database/db-setup';
import { LoggerService } from '../logger/logger.service';

export interface ScannedProject {
  name: string;
  folderPath: string;
  language: string;
  framework: string;
  version: string;
  packageManager: string;
  estimatedRunCommand: string;
  estimatedBuildCommand: string;
  estimatedInstallCommand: string;
  size: number;
}

const BLACKLIST = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'target',
  'venv',
  '.cache',
  'coverage',
  'bin',
  'obj',
  '.idea',
  '.vscode',
]);

export class ScannerService {
  /**
   * Scans a root folder recursively and saves all detected projects into SQLite.
   */
  public static async scanAndSave(rootPath: string): Promise<ScannedProject[]> {
    try {
      await LoggerService.info('Scanner started', `Scanning path: ${rootPath}`);
      
      const detected: ScannedProject[] = [];
      await this.scanDir(rootPath, detected);

      const prisma = getPrismaClient();

      // Save to database
      for (const p of detected) {
        const existing = await prisma.project.findUnique({
          where: { folderPath: p.folderPath },
        });

        if (existing) {
          await prisma.project.update({
            where: { id: existing.id },
            data: {
              name: p.name,
              language: p.language,
              framework: p.framework,
              size: p.size,
              updatedAt: new Date(),
            },
          });
        } else {
          await prisma.project.create({
            data: {
              name: p.name,
              folderPath: p.folderPath,
              language: p.language,
              framework: p.framework,
              size: p.size,
              gitInitialized: fs.existsSync(path.join(p.folderPath, '.git')),
            },
          });
        }
      }

      await LoggerService.info('Scanner finished', `Detected ${detected.length} projects`);
      return detected;
    } catch (err) {
      await LoggerService.error('Scanner failed', (err as Error).stack);
      throw err;
    }
  }

  private static async scanDir(dirPath: string, projects: ScannedProject[]): Promise<number> {
    let folderSize = 0;
    let files: string[] = [];
    
    try {
      files = await fs.promises.readdir(dirPath);
    } catch (err) {
      return 0;
    }

    const subdirs: string[] = [];
    let isProjectDir = false;
    let projectDetails: Partial<ScannedProject> | null = null;

    for (const file of files) {
      const fullPath = path.join(dirPath, file);
      let stat: fs.Stats;
      
      try {
        stat = await fs.promises.stat(fullPath);
      } catch {
        continue;
      }

      if (stat.isDirectory()) {
        if (!BLACKLIST.has(file)) {
          subdirs.push(fullPath);
        }
      } else {
        folderSize += stat.size;
        
        if (!isProjectDir) {
          const details = this.detectProject(dirPath, file);
          if (details) {
            isProjectDir = true;
            projectDetails = details;
          }
        }
      }
    }

    for (const subdir of subdirs) {
      const subSize = await this.scanDir(subdir, projects);
      folderSize += subSize;
    }

    if (isProjectDir && projectDetails) {
      projects.push({
        name: projectDetails.name || path.basename(dirPath),
        folderPath: dirPath,
        language: projectDetails.language || 'Unknown',
        framework: projectDetails.framework || 'Unknown',
        version: projectDetails.version || '1.0.0',
        packageManager: projectDetails.packageManager || 'none',
        estimatedRunCommand: projectDetails.estimatedRunCommand || '',
        estimatedBuildCommand: projectDetails.estimatedBuildCommand || '',
        estimatedInstallCommand: projectDetails.estimatedInstallCommand || '',
        size: folderSize,
      });
    }

    return folderSize;
  }

  private static detectProject(dirPath: string, filename: string): Partial<ScannedProject> | null {
    const fullPath = path.join(dirPath, filename);

    if (filename === 'package.json') {
      try {
        const content = fs.readFileSync(fullPath, 'utf8');
        const pkg = JSON.parse(content);
        const name = pkg.name || path.basename(dirPath);
        const version = pkg.version || '1.0.0';

        let framework = 'NodeJS';
        const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
        if (deps.react) framework = 'React';
        else if (deps.vue) framework = 'Vue';
        else if (deps.next) framework = 'Next.js';
        else if (deps.nuxt) framework = 'Nuxt.js';
        else if (deps['@angular/core']) framework = 'Angular';
        else if (deps.express) framework = 'Express';
        else if (deps.nest) framework = 'NestJS';

        let packageManager = 'npm';
        if (fs.existsSync(path.join(dirPath, 'package-lock.json'))) packageManager = 'npm';
        else if (fs.existsSync(path.join(dirPath, 'yarn.lock'))) packageManager = 'yarn';
        else if (fs.existsSync(path.join(dirPath, 'pnpm-lock.yaml'))) packageManager = 'pnpm';

        const runCmd = pkg.scripts?.dev ? `${packageManager} run dev` : (pkg.scripts?.start ? `${packageManager} start` : '');
        const buildCmd = pkg.scripts?.build ? `${packageManager} run build` : '';
        const installCmd = `${packageManager} install`;

        return {
          name,
          language: 'TypeScript/JavaScript',
          framework,
          version,
          packageManager,
          estimatedRunCommand: runCmd,
          estimatedBuildCommand: buildCmd,
          estimatedInstallCommand: installCmd,
        };
      } catch {
        return null;
      }
    }

    if (filename === 'requirements.txt' || filename === 'pyproject.toml') {
      let name = path.basename(dirPath);
      let version = '1.0.0';
      let framework = 'Python App';
      let packageManager = 'pip';
      let installCmd = 'pip install -r requirements.txt';
      let runCmd = 'python main.py';
      let buildCmd = '';

      if (filename === 'pyproject.toml') {
        packageManager = 'poetry';
        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          const nameMatch = content.match(/name\s*=\s*"(.*)"/);
          const verMatch = content.match(/version\s*=\s*"(.*)"/);
          if (nameMatch) name = nameMatch[1];
          if (verMatch) version = verMatch[1];
          installCmd = 'poetry install';
          runCmd = 'poetry run python main.py';
        } catch {}
      } else {
        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          if (content.includes('django')) framework = 'Django';
          else if (content.includes('flask')) framework = 'Flask';
          else if (content.includes('fastapi')) framework = 'FastAPI';
        } catch {}
      }

      return {
        name,
        language: 'Python',
        framework,
        version,
        packageManager,
        estimatedRunCommand: runCmd,
        estimatedBuildCommand: buildCmd,
        estimatedInstallCommand: installCmd,
      };
    }

    if (filename === 'Cargo.toml') {
      let name = path.basename(dirPath);
      let version = '0.1.0';
      try {
        const content = fs.readFileSync(fullPath, 'utf8');
        const nameMatch = content.match(/name\s*=\s*"(.*)"/);
        const verMatch = content.match(/version\s*=\s*"(.*)"/);
        if (nameMatch) name = nameMatch[1];
        if (verMatch) version = verMatch[1];
      } catch {}

      return {
        name,
        language: 'Rust',
        framework: 'Cargo',
        version,
        packageManager: 'cargo',
        estimatedRunCommand: 'cargo run',
        estimatedBuildCommand: 'cargo build --release',
        estimatedInstallCommand: 'cargo fetch',
      };
    }

    if (filename === 'go.mod') {
      let name = path.basename(dirPath);
      try {
        const content = fs.readFileSync(fullPath, 'utf8');
        const moduleMatch = content.match(/module\s+(.*)/);
        if (moduleMatch) name = path.basename(moduleMatch[1].trim());
      } catch {}

      return {
        name,
        language: 'Go',
        framework: 'Go Module',
        version: '1.0.0',
        packageManager: 'go',
        estimatedRunCommand: 'go run .',
        estimatedBuildCommand: 'go build',
        estimatedInstallCommand: 'go mod download',
      };
    }

    if (filename === 'composer.json') {
      try {
        const content = fs.readFileSync(fullPath, 'utf8');
        const pkg = JSON.parse(content);
        return {
          name: pkg.name || path.basename(dirPath),
          language: 'PHP',
          framework: 'Composer Project',
          version: pkg.version || '1.0.0',
          packageManager: 'composer',
          estimatedRunCommand: 'php artisan serve',
          estimatedBuildCommand: '',
          estimatedInstallCommand: 'composer install',
        };
      } catch {
        return null;
      }
    }

    if (filename === 'pubspec.yaml') {
      let name = path.basename(dirPath);
      let version = '1.0.0';
      try {
        const content = fs.readFileSync(fullPath, 'utf8');
        const nameMatch = content.match(/name:\s*(.*)/);
        const verMatch = content.match(/version:\s*(.*)/);
        if (nameMatch) name = nameMatch[1].trim();
        if (verMatch) version = verMatch[1].trim();
      } catch {}

      return {
        name,
        language: 'Dart',
        framework: 'Flutter',
        version,
        packageManager: 'flutter',
        estimatedRunCommand: 'flutter run',
        estimatedBuildCommand: 'flutter build',
        estimatedInstallCommand: 'flutter pub get',
      };
    }

    if (filename === 'pom.xml') {
      return {
        name: path.basename(dirPath),
        language: 'Java',
        framework: 'Maven',
        version: '1.0.0',
        packageManager: 'mvn',
        estimatedRunCommand: 'mvn spring-boot:run',
        estimatedBuildCommand: 'mvn clean package',
        estimatedInstallCommand: 'mvn install',
      };
    }

    if (filename === 'build.gradle') {
      return {
        name: path.basename(dirPath),
        language: 'Java',
        framework: 'Gradle',
        version: '1.0.0',
        packageManager: 'gradle',
        estimatedRunCommand: './gradlew bootRun',
        estimatedBuildCommand: './gradlew build',
        estimatedInstallCommand: './gradlew dependencies',
      };
    }

    if (filename === 'CMakeLists.txt' || filename === 'Makefile') {
      return {
        name: path.basename(dirPath),
        language: 'C/C++',
        framework: filename === 'CMakeLists.txt' ? 'CMake' : 'Make',
        version: '1.0.0',
        packageManager: 'make',
        estimatedRunCommand: './main',
        estimatedBuildCommand: 'make',
        estimatedInstallCommand: '',
      };
    }

    if (filename === 'index.html') {
      return {
        name: path.basename(dirPath),
        language: 'HTML',
        framework: 'Static Web',
        version: '1.0.0',
        packageManager: 'none',
        estimatedRunCommand: 'npx serve .',
        estimatedBuildCommand: '',
        estimatedInstallCommand: '',
      };
    }

    return null;
  }
}
