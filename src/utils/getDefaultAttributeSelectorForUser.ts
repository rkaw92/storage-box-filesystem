import { AttributeSelector } from "../types/AttributeSelector";
import { UserContext } from "../types/UserContext";
import { UserIdentification } from "../types/UserIdentification";

export function getDefaultAttributeSelectorForUser(user: UserIdentification): AttributeSelector {
    return {
        issuer: user.issuer,
        attribute: '_subject',
        value: user.subject
    };
};
