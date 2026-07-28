# Workflow cases

These are reproducible workflow examples, not performance claims. Each case describes what a user can do in the preview build and what still needs human review.

## Case 1: Product main image

**Input:** product references, a text brief, an image model, and an output size.

**Flow:**

1. Sign in to the employee workspace.
2. Add one or more reference images.
3. Write the composition, subject, background, and lighting requirements.
4. Choose a model from the local model list or use the administrator default.
5. Generate up to the configured image count and copy the final prompt when needed.

**Output:** generated images, task status, prompt metadata, and a conversation snapshot saved locally. If enabled, the snapshot and local image assets are copied to the configured cloud prefix.

**Review:** check product identity, claims, typography, trademarks, and commercial usage rights before publishing.

## Case 2: Long detail page

**Input:** product information, a planning spreadsheet, references, and a requested page structure.

**Flow:**

1. Add the planning material in the detail-page workflow.
2. Review the parsed sheets, modules, and selected images.
3. Generate screens in sequence so each screen has a distinct role.
4. Inspect the assembled long page and failed/partial groups.
5. Keep the approved conversation and assets in the local runtime.

**Output:** a sequence of composed detail-page screens and the associated planning metadata. The workflow is designed to fail clearly when a module is incomplete instead of silently exporting a misleading result.

**Review:** validate copy, prices, dimensions, product claims, image rights, and final layout at the target device width.

## Case 3: Canvas iteration and backup

**Input:** uploaded assets, frames, text, shapes, and a selected image for continuation.

**Flow:**

1. Upload owned assets to the canvas.
2. Add a main-image frame, poster frame, or long-detail frame.
3. Arrange layers, add text and shapes, and use image continuation when required.
4. Save the project locally.
5. If cloud backup is enabled, wait for the asynchronous copy to finish in the server log; the employee workspace continues to use the local project.

**Output:** a project JSON file, local asset files, and an optional cloud backup snapshot.

**Review:** confirm that all referenced assets are owned or licensed and that no private customer data is included in a public export.
