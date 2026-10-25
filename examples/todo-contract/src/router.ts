import { implement } from '@orpc/server'

import { contract } from './contract'
import * as handlers from './handlers'

/** The contract bound to the handlers; `router()` checks that every procedure is implemented. */
export const router = implement(contract).router({ ...handlers })
