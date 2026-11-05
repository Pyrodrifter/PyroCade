These are PyroCade's paid-for faults, appended as they are met; a listed fault repeated is a defect in whatever repeated it.

1. Do not convert `manual` media paths to file URLs: the renderer passes them directly to Tauri's native opener; artwork paths use file URLs.
