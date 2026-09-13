#!/usr/bin/env node
import * as NodeRuntime from '@effect/platform-node/NodeRuntime'
import * as NodeServices from '@effect/platform-node/NodeServices'
import { Effect } from 'effect'

import { wakusei } from './cli/index.js'

NodeRuntime.runMain(
  wakusei(process.argv.slice(2), import.meta.url).pipe(Effect.provide(NodeServices.layer)),
)
