These are PyroCade's paid-for faults, appended as they are met; a listed fault repeated is a defect in whatever repeated it.

1. Do not convert `manual` media paths to file URLs: the renderer passes them directly to Tauri's native opener; artwork paths use file URLs.
2. Do not drop a launched emulator child without waiting for it when `hideWhilePlaying` is false; the process still must be reaped.
3. Do not silently skip unsafe ZIP member paths during extraction; reject the archive before extracting any member.
4. Do not treat Android Storage Access Framework content URIs as filesystem paths; persistent document-tree grants and URI-aware I/O are required, and Tauri's dialog plugin does not support Android folder picking.
