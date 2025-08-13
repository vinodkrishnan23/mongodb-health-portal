// MongoDB Driver Compatibility Matrix
// Based on official MongoDB driver compatibility documentation

export interface DriverCompatibility {
  driverName: string;
  supportedVersions: {
    [mongoVersion: string]: string[];
  };
}

export const DRIVER_COMPATIBILITY_MATRIX: DriverCompatibility[] = [
  {
    driverName: "MongoDB Node.js Driver",
    supportedVersions: {
  "8.0": ["6.18", "6.17", "6.16", "6.15", "6.14", "6.13", "6.12", "6.11", "6.10", "6.9"],
  "7.0": ["6.18", "6.17", "6.16", "6.15", "6.14", "6.13", "6.12", "6.11", "6.10", "6.9", "6.8", "6.7", "6.6", "6.5", "6.4", "6.3", "6.2", "6.1", "6.0", "5.9", "5.8", "5.7"],
  "6.0": ["6.18", "6.17", "6.16", "6.15", "6.14", "6.13", "6.12", "6.11", "6.10", "6.9", "6.8", "6.7", "6.6", "6.5", "6.4", "6.3", "6.2", "6.1", "6.0", "5.9", "5.8", "5.7", "5.6", "5.5", "5.4", "5.3", "5.2", "5.1", "5.0"],
  "5.0": ["6.18", "6.17", "6.16", "6.15", "6.14", "6.13", "6.12", "6.11", "6.10", "6.9", "6.8", "6.7", "6.6", "6.5", "6.4", "6.3", "6.2", "6.1", "6.0", "5.9", "5.8", "5.7", "5.6", "5.5", "5.4", "5.3", "5.2", "5.1", "5.0"],
  "4.4": ["6.18", "6.17", "6.16", "6.15", "6.14", "6.13", "6.12", "6.11", "6.10", "6.9", "6.8", "6.7", "6.6", "6.5", "6.4", "6.3", "6.2", "6.1", "6.0", "5.9", "5.8", "5.7", "5.6", "5.5", "5.4", "5.3", "5.2", "5.1", "5.0"],
  "4.2": ["6.18", "6.17", "6.16", "6.15", "6.14", "6.13", "6.12", "6.11", "6.10", "6.9", "6.8", "6.7", "6.6", "6.5", "6.4", "6.3", "6.2", "6.1", "6.0", "5.9", "5.8", "5.7", "5.6", "5.5", "5.4", "5.3", "5.2", "5.1", "5.0"],
  "4.0": ["6.16", "6.15", "6.14", "6.13", "6.12", "6.11", "6.10", "6.9", "6.8", "6.7", "6.6", "6.5", "6.4", "6.3", "6.2", "6.1", "6.0", "5.9", "5.8", "5.7", "5.6", "5.5", "5.4", "5.3", "5.2", "5.1", "5.0"],
  "3.6": ["6.9", "6.8", "6.7", "6.6", "6.5", "6.4", "6.3", "6.2", "6.1", "6.0", "5.9", "5.8", "5.7", "5.6", "5.5", "5.4", "5.3", "5.2", "5.1", "5.0"]
}
  },
  {
    driverName: "PyMongo",
    supportedVersions: {
  "8.0": ["4.13", "4.12", "4.11", "4.10", "4.9", "4.8", "4.7", "4.6", "4.5", "4.4", "4.3", "4.2", "4.1", "4.0", "3.12", "3.11", "3.10", "3.9", "3.8", "3.7"],
  "7.0": ["4.13", "4.12", "4.11", "4.10", "4.9", "4.8", "4.7", "4.6", "4.5", "4.4"],
  "6.0": ["4.13", "4.12", "4.11", "4.10", "4.9"]
}
  },
  {
    driverName: "Java Driver",
    supportedVersions: {
  "8.1": ["5.5", "5.4", "5.3", "5.2"],
  "8.0": ["5.5", "5.4", "5.3", "5.2"],
  "7.0": ["5.5", "5.4", "5.3", "5.2", "5.1", "5.0", "4.11", "4.10"],
  "6.0": ["5.5", "5.4", "5.3", "5.2", "5.1", "5.0", "4.11", "4.10", "4.9", "4.8", "4.7"]
}
  },
  {
    driverName: "C# Driver",
    supportedVersions: {
  "8.1": ["3.4", "3.3", "3.2", "3.1", "3.0", "2.29"],
  "8.0": ["3.4", "3.3", "3.2", "3.1", "3.0", "2.29"],
  "7.0": ["3.4", "3.3", "3.2", "3.1", "3.0", "2.29", "2.28", "2.27", "2.26", "2.25", "2.24", "2.23", "2.22", "2.21", "2.20"],
  "6.0": ["3.4", "3.3", "3.2", "3.1", "3.0", "2.29", "2.28", "2.27", "2.26", "2.25", "2.24", "2.23", "2.22", "2.21", "2.20", "2.19", "2.18", "2.17", "2.16"]
}
  },
  {
    driverName: "Go Driver",
    supportedVersions: {
      "6.0": ["1.11", "1.12", "1.13", "1.14", "1.15", "1.16", "1.17", "2.0","2.1","2.2"],
      "6.1": ["1.11", "1.12", "1.13", "1.14", "1.15", "1.16", "1.17", "2.0","2.1","2.2"],
      "7.0": ["1.12", "1.13", "1.14", "1.15", "1.16", "1.17", "2.0","2.1","2.2"],
      "8.0": ["2.1", "2.2"]
    }
  },
  {
    driverName: "Ruby Driver",
    supportedVersions: {
      "6.0": ["2.18", "2.19", "2.20", "2.21"],
      "7.0": ["2.19", "2.20", "2.21"],
      "8.0": ["2.21"]
    }
  },
  {
    driverName: "Scala Driver",
    supportedVersions: {
      "6.0": ["4.7", "4.8", "4.9", "4.10","5.1","5.2","5.3","5.4","5.5"],
      "6.1": ["4.8", "4.9", "4.10","5.1","5.2","5.3","5.4","5.5"],
      "7.0": ["4.10","5.1","5.2","5.3","5.4","5.5"],
      "8.0": ["5.2","5.3","5.4","5.5"]
    }
  },
  {
    driverName: "Rust Driver",
    supportedVersions: {
      "6.0": ["2.6", "2.7", "2.8", "2.9", "3.0","3.1", "3.2"],
      "7.0": ["2.6", "2.7", "2.8", "2.9", "3.0","3.1", "3.2"],
      "8.0": ["3.1", "3.2"]
    }
  }
];

export interface CompatibilityResult {
  isCompatible: boolean;
  recommendedVersions?: string[];
  notes?: string;
}

export interface CombinedCompatibilityResult {
  isCompatible: boolean;
  results: {
    driverName: string;
    normalizedName: string;
    isCompatible: boolean;
    recommendedVersions?: string[];
    notes?: string;
  }[];
  notes?: string;
}

/**
 * Check compatibility for combined driver names like "nodejs|Mongoose"
 */
export function checkCombinedDriverCompatibility(
  driverName: string, 
  driverVersion: string, 
  mongodbVersion: string
): CombinedCompatibilityResult {
  // Split driver name by common separators
  const driverParts = driverName.split(/[|,&+\/]/).map(part => part.trim()).filter(part => part.length > 0);
  
  if (driverParts.length === 1) {
    // Single driver, use regular compatibility check
    const result = checkDriverCompatibility(driverName, driverVersion, mongodbVersion);
    return {
      isCompatible: result.isCompatible,
      results: [{
        driverName: driverName,
        normalizedName: normalizeDriverName(driverName),
        isCompatible: result.isCompatible,
        recommendedVersions: result.recommendedVersions,
        notes: result.notes
      }]
    };
  }
  
  // Multiple drivers, check each one
  const results = driverParts.map(part => {
    const result = checkDriverCompatibility(part, driverVersion, mongodbVersion);
    return {
      driverName: part,
      normalizedName: normalizeDriverName(part),
      isCompatible: result.isCompatible,
      recommendedVersions: result.recommendedVersions,
      notes: result.notes
    };
  });
  
  const allCompatible = results.every(r => r.isCompatible);
  const someCompatible = results.some(r => r.isCompatible);
  
  let overallNotes = '';
  if (!allCompatible) {
    const incompatibleDrivers = results.filter(r => !r.isCompatible).map(r => r.driverName);
    if (incompatibleDrivers.length === results.length) {
      overallNotes = `None of the drivers (${incompatibleDrivers.join(', ')}) are compatible with MongoDB ${mongodbVersion}`;
    } else {
      overallNotes = `Some drivers are incompatible: ${incompatibleDrivers.join(', ')}`;
    }
  }
  
  return {
    isCompatible: allCompatible,
    results,
    notes: overallNotes || undefined
  };
}

/**
 * Check if a driver version is compatible with a MongoDB version
 */
export function checkDriverCompatibility(
  driverName: string, 
  driverVersion: string, 
  mongodbVersion: string
): CompatibilityResult {
  // Normalize driver name for matching
  const normalizedDriverName = normalizeDriverName(driverName);
  
  // Find the driver compatibility data
  const driverCompat = DRIVER_COMPATIBILITY_MATRIX.find(driver => 
    normalizeDriverName(driver.driverName) === normalizedDriverName
  );
  
  if (!driverCompat) {
    return {
      isCompatible: false,
      notes: `Unknown driver: ${driverName}`
    };
  }
  
  // Get supported versions for the MongoDB version
  const supportedVersions = driverCompat.supportedVersions[mongodbVersion];
  
  if (!supportedVersions) {
    // Check if this driver supports any version of MongoDB
    const allSupportedMongoVersions = Object.keys(driverCompat.supportedVersions);
    const minSupportedVersion = allSupportedMongoVersions.sort()[0];
    
    return {
      isCompatible: false,
      notes: `${driverCompat.driverName} does not support MongoDB ${mongodbVersion}. Minimum supported MongoDB version: ${minSupportedVersion}`
    };
  }
  
  // Extract major.minor version from driver version (e.g., "4.2.1" -> "4.2")
  const driverMajorMinor = extractMajorMinorVersion(driverVersion);
  
  // Check if the driver version is in the supported list
  const isCompatible = supportedVersions.some(supportedVersion => 
    driverMajorMinor === supportedVersion || 
    driverVersion.startsWith(supportedVersion + ".")
  );
  
  return {
    isCompatible,
    recommendedVersions: isCompatible ? undefined : supportedVersions.slice(-3), // Show last 3 supported versions
    notes: isCompatible ? undefined : `Driver version ${driverVersion} is not compatible with MongoDB ${mongodbVersion}`
  };
}

/**
 * Normalize driver names for consistent matching
 */
function normalizeDriverName(driverName: string): string {
  const name = driverName.toLowerCase().trim();
  
  // Map various driver name variations to standard names
  const driverMappings: { [key: string]: string } = {
    'mongodb node.js driver': 'mongodb node.js driver',
    'nodejs': 'mongodb node.js driver',
    'node.js': 'mongodb node.js driver',
    'node': 'mongodb node.js driver',
    'mongoose': 'mongoose',
    'pymongo': 'pymongo',
    'python': 'pymongo',
    'java driver': 'java driver',
    'java': 'java driver',
    'c# driver': 'c# driver',
    'csharp': 'c# driver',
    '.net': 'c# driver',
    'go driver': 'go driver',
    'go': 'go driver',
    'golang': 'go driver',
    'php driver': 'php driver',
    'php': 'php driver',
    'ruby driver': 'ruby driver',
    'ruby': 'ruby driver',
    'scala driver': 'scala driver',
    'scala': 'scala driver',
    'rust driver': 'rust driver',
    'rust': 'rust driver',
    'swift driver': 'swift driver',
    'swift': 'swift driver',
    'kotlin driver': 'kotlin driver',
    'kotlin': 'kotlin driver',
    'typescript driver': 'typescript driver',
    'typescript': 'typescript driver',
    'ts': 'typescript driver'
  };
  
  // Check for exact matches first
  if (driverMappings[name]) {
    return driverMappings[name];
  }
  
  // Check for partial matches
  for (const [pattern, standard] of Object.entries(driverMappings)) {
    if (name.includes(pattern) || pattern.includes(name)) {
      return standard;
    }
  }
  
  return name;
}

/**
 * Extract major.minor version from a version string
 */
function extractMajorMinorVersion(version: string): string {
  const match = version.match(/^(\d+\.\d+)/);
  return match ? match[1] : version;
}

/**
 * Get all supported MongoDB versions
 */
export function getSupportedMongoDBVersions(): string[] {
  return ["4.2", "4.4", "5.0", "6.0", "7.0", "8.0"];
}

/**
 * Get MongoDB version display name
 */
export function getMongoDBVersionDisplayName(version: string): string {
  const versionNames: { [key: string]: string } = {
    "4.2": "MongoDB 4.2",
    "4.4": "MongoDB 4.4",
    "5.0": "MongoDB 5.0",
    "6.0": "MongoDB 6.0",
    "7.0": "MongoDB 7.0",
    "8.0": "MongoDB 8.0"
  };
  
  return versionNames[version] || `MongoDB ${version}`;
}

/**
 * Get minimum supported MongoDB version for a driver
 */
export function getMinimumSupportedMongoDBVersion(driverName: string): string | null {
  const normalizedDriverName = normalizeDriverName(driverName);
  const driverCompat = DRIVER_COMPATIBILITY_MATRIX.find(driver => 
    normalizeDriverName(driver.driverName) === normalizedDriverName
  );
  
  if (!driverCompat) {
    return null;
  }
  
  const supportedVersions = Object.keys(driverCompat.supportedVersions).sort();
  return supportedVersions.length > 0 ? supportedVersions[0] : null;
}

/**
 * Get all MongoDB versions supported by a driver
 */
export function getSupportedMongoDBVersionsForDriver(driverName: string): string[] {
  const normalizedDriverName = normalizeDriverName(driverName);
  const driverCompat = DRIVER_COMPATIBILITY_MATRIX.find(driver => 
    normalizeDriverName(driver.driverName) === normalizedDriverName
  );
  
  if (!driverCompat) {
    return [];
  }
  
  return Object.keys(driverCompat.supportedVersions).sort();
}
