import { UserContext } from "./UserContext";

export interface ContextualProxyConstructor<ProxiedInterface, ContextType = UserContext> {
    new(instance: ProxiedInterface, context: ContextType): ProxiedInterface;
};

