# Third-party dependencies

The added `judge-site/` source uses the supplied Sites Vinext starter and its retained MIT build-integration license. Vinext, React/React DOM, Vite, Next.js, Wrangler, Miniflare, Drizzle and the remaining starter dependencies retain their own package licenses. Both pinned lockfiles are shipped; dependency binaries are installed from npm, not redistributed in the source snapshot. The Sites Worker package keeps the companion MIT LICENSE/NOTICE and the eight copied companion modules' provenance manifest. No private application code or character files enter it.

The owner approved MIT for the new independent companion source and procedural fixtures on October 12. See the project `LICENSE` and scope `NOTICE`. These dependency licenses are separate and must be retained when redistributing dependencies. Dependencies are installed from npm using the pinned lockfile; the draft bundle includes their references, not their binaries. See each installed package's `LICENSE`/`NOTICE`.

| Dependency | Version | Registry license |
| --- | --- | --- |
| ajv | 8.20.0 | MIT |
| gltf-validator | 2.0.0-dev.3.10 | Apache-2.0 |
| fast-deep-equal | 3.1.3 | MIT |
| fast-uri | 3.1.8 | BSD-3-Clause |
| json-schema-traverse | 1.0.0 | MIT |
| require-from-string | 2.0.2 | MIT |
| @playwright/test | 1.64.0 | Apache-2.0 |
| playwright | 1.64.0 | Apache-2.0 |
| playwright-core | 1.64.0 | Apache-2.0 |

Node.js, Microsoft Edge and optional Playwright browser downloads are external runtimes with their own licenses. The companion bundle does not redistribute them. The [Khronos glTF specification](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html) is referenced for format semantics; no private Cast parser or third-party GLB asset is copied.

The [official Khronos glTF Validator](https://github.com/KhronosGroup/glTF-Validator) runs locally in a bounded worker. Copyright (c) 2016-2019 The Khronos Group Inc.; Apache License 2.0. Its license and package notices remain in the installed npm dependency. It has a separate conformance scope and does not certify visual appearance or engine behavior.

NVIDIA model use follows the [NVIDIA Nemotron Open Model License](https://www.nvidia.com/en-us/agreements/enterprise-software/nvidia-nemotron-open-model-license/). No weights, training data or NVIDIA model code are distributed by this adapter. Model/serverless service terms and contest agreements have not been accepted on the owner's behalf.
