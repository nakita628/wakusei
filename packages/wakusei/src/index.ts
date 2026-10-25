#!/usr/bin/env node
import * as NodeRuntime from '@effect/platform-node/NodeRuntime'
import * as NodeServices from '@effect/platform-node/NodeServices'
import { Effect } from 'effect'

import { wakusei } from './cli/index.js'

NodeRuntime.runMain(wakusei().pipe(Effect.provide(NodeServices.layer)))
