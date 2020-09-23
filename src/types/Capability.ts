export type Capability = "create-fs";

export function isCapability(capabilityName: string): capabilityName is Capability {
    const knownCapabilities = new Set([ 'create-fs' ]);
    return knownCapabilities.has(capabilityName);
};
