import * as util from "@ai-sdk/provider-utils"

export const createFactory =
  (
    util as typeof util & {
      createProviderToolFactory?: typeof util.createProviderDefinedToolFactory
    }
  ).createProviderDefinedToolFactory ??
  (
    util as typeof util & {
      createProviderToolFactory?: typeof util.createProviderDefinedToolFactory
    }
  ).createProviderToolFactory

export const createFactoryWithOutput =
  (
    util as typeof util & {
      createProviderToolFactoryWithOutputSchema?: typeof util.createProviderDefinedToolFactoryWithOutputSchema
    }
  ).createProviderDefinedToolFactoryWithOutputSchema ??
  (
    util as typeof util & {
      createProviderToolFactoryWithOutputSchema?: typeof util.createProviderDefinedToolFactoryWithOutputSchema
    }
  ).createProviderToolFactoryWithOutputSchema
