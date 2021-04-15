import { AttributeBasedCriterion } from "../types/AttributeBasedCriterion";
import { UserContext } from "../types/UserContext";
import { UserIdentification } from "../types/UserIdentification";

export function getDefaultCriterionForUser(user: UserIdentification): AttributeBasedCriterion {
    return {
        issuer: user.issuer,
        attribute: '_subject',
        value: user.subject
    };
};
