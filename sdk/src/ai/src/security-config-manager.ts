import { z } from 'zod'; // For runtime validation

// Interfaces for type safety
interface SecurityProfile {
name: string;
description: string;
environment: 'development' | 'staging' | 'production';
thresholds: DetectionThresholds;
fuzzingConfig: FuzzingConfiguration;
vulnerabilityRules: VulnerabilityRules;
reportingPreferences: ReportingPreferences;
authConfig: AuthConfiguration;
lastUpdated: Date;
}

interface DetectionThresholds {
minimumConfidenceScore: number;
maximumFalsePositiveRate: number;
sensitivityLevel: 1 | 2 | 3 | 4 | 5;
customThresholds: Map<string, number>;
}

interface FuzzingConfiguration {
maxIterations: number;
timeout: number;
seed?: string;
mutationRate: number;
coverageTarget: number;
customMutators: string[];
}

interface VulnerabilityRules {
enabled: boolean;
customRules: Map<string, boolean>;
severityThresholds: Map<string, number>;
exclusions: string[];
}

interface ReportingPreferences {
format: 'json' | 'html' | 'pdf';
includeRemediation: boolean;
detailLevel: 'basic' | 'detailed' | 'comprehensive';
automaticReports: boolean;
notificationEmails: string[];
}

interface AuthConfiguration {
enabled: boolean;
authMethod: 'oauth' | 'apiKey' | 'jwt';
roles: Map<string, string[]>;
tokenExpiration: number;
}

// Validation schemas using zod
const securityProfileSchema = z.object({
name: z.string().min(1),
environment: z.enum(['development', 'staging', 'production']),
thresholds: z.object({
    minimumConfidenceScore: z.number().min(0).max(1),
    maximumFalsePositiveRate: z.number().min(0).max(1),
    sensitivityLevel: z.number().min(1).max(5),
}),
// Additional validation schemas...
});

export class SecurityConfigManager {
private static instance: SecurityConfigManager;
private profiles: Map<string, SecurityProfile>;
private activeProfile: SecurityProfile | null;

private constructor() {
    this.profiles = new Map();
    this.activeProfile = null;
}

public static getInstance(): SecurityConfigManager {
    if (!SecurityConfigManager.instance) {
    SecurityConfigManager.instance = new SecurityConfigManager();
    }
    return SecurityConfigManager.instance;
}

public createProfile(profile: SecurityProfile): void {
    try {
    this.validateProfile(profile);
    this.profiles.set(profile.name, {
        ...profile,
        lastUpdated: new Date()
    });
    } catch (error) {
    throw new Error(`Invalid security profile: ${error.message}`);
    }
}

public getProfile(name: string): SecurityProfile | undefined {
    return this.profiles.get(name);
}

public setActiveProfile(name: string): void {
    const profile = this.profiles.get(name);
    if (!profile) {
    throw new Error(`Profile ${name} not found`);
    }
    this.activeProfile = profile;
}

public updateThresholds(name: string, thresholds: Partial<DetectionThresholds>): void {
    const profile = this.profiles.get(name);
    if (!profile) {
    throw new Error(`Profile ${name} not found`);
    }

    this.profiles.set(name, {
    ...profile,
    thresholds: { ...profile.thresholds, ...thresholds },
    lastUpdated: new Date()
    });
}

public configureFuzzing(name: string, config: Partial<FuzzingConfiguration>): void {
    const profile = this.profiles.get(name);
    if (!profile) {
    throw new Error(`Profile ${name} not found`);
    }

    this.profiles.set(name, {
    ...profile,
    fuzzingConfig: { ...profile.fuzzingConfig, ...config },
    lastUpdated: new Date()
    });
}

public updateVulnerabilityRules(name: string, rules: Partial<VulnerabilityRules>): void {
    const profile = this.profiles.get(name);
    if (!profile) {
    throw new Error(`Profile ${name} not found`);
    }

    this.profiles.set(name, {
    ...profile,
    vulnerabilityRules: { ...profile.vulnerabilityRules, ...rules },
    lastUpdated: new Date()
    });
}

public configureReporting(name: string, preferences: Partial<ReportingPreferences>): void {
    const profile = this.profiles.get(name);
    if (!profile) {
    throw new Error(`Profile ${name} not found`);
    }

    this.profiles.set(name, {
    ...profile,
    reportingPreferences: { ...profile.reportingPreferences, ...preferences },
    lastUpdated: new Date()
    });
}

public updateAuthConfig(name: string, config: Partial<AuthConfiguration>): void {
    const profile = this.profiles.get(name);
    if (!profile) {
    throw new Error(`Profile ${name} not found`);
    }

    this.profiles.set(name, {
    ...profile,
    authConfig: { ...profile.authConfig, ...config },
    lastUpdated: new Date()
    });
}

private validateProfile(profile: SecurityProfile): void {
    const result = securityProfileSchema.safeParse(profile);
    if (!result.success) {
    throw new Error(result.error.message);
    }

    this.validateThresholds(profile.thresholds);
    this.validateFuzzingConfig(profile.fuzzingConfig);
    this.validateVulnerabilityRules(profile.vulnerabilityRules);
    this.validateReportingPreferences(profile.reportingPreferences);
    this.validateAuthConfig(profile.authConfig);
}

private validateThresholds(thresholds: DetectionThresholds): void {
    if (thresholds.minimumConfidenceScore < 0 || thresholds.minimumConfidenceScore > 1) {
    throw new Error('Minimum confidence score must be between 0 and 1');
    }
    // Additional validation...
}

private validateFuzzingConfig(config: FuzzingConfiguration): void {
    if (config.maxIterations <= 0) {
    throw new Error('Max iterations must be positive');
    }
    if (config.mutationRate < 0 || config.mutationRate > 1) {
    throw new Error('Mutation rate must be between 0 and 1');
    }
    // Additional validation...
}

private validateVulnerabilityRules(rules: VulnerabilityRules): void {
    rules.severityThresholds.forEach((threshold, key) => {
    if (threshold < 0 || threshold > 10) {
        throw new Error(`Invalid severity threshold for ${key}`);
    }
    });
    // Additional validation...
}

private validateReportingPreferences(preferences: ReportingPreferences): void {
    preferences.notificationEmails.forEach(email => {
    if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
        throw new Error(`Invalid email address: ${email}`);
    }
    });
    // Additional validation...
}

private validateAuthConfig(config: AuthConfiguration): void {
    if (config.tokenExpiration <= 0) {
    throw new Error('Token expiration must be positive');
    }
    // Additional validation...
}
}

