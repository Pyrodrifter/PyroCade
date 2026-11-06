use std::path::PathBuf;

// StorageRef distinguishes a filesystem path from an Android document-tree URI.
// A content URI is not a path: it cannot be read with std::fs.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum StorageRef {
    FilePath(PathBuf),
    ContentUri(String),
}

pub fn is_content_uri(value: &str) -> bool {
    value.trim_start().starts_with("content://")
}

// Parse one trimmed entry from a persisted romDir list. Content URIs keep
// their exact spelling; the URI is persisted, never canonicalised as a path.
pub fn parse_storage_ref(value: &str) -> Option<StorageRef> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }
    if is_content_uri(trimmed) {
        Some(StorageRef::ContentUri(trimmed.to_owned()))
    } else {
        Some(StorageRef::FilePath(PathBuf::from(trimmed)))
    }
}

pub fn split_storage_refs(value: &str) -> Vec<StorageRef> {
    value.split('|').filter_map(parse_storage_ref).collect()
}

impl StorageRef {
    pub fn is_filesystem(&self) -> bool {
        matches!(self, StorageRef::FilePath(_))
    }

    pub fn as_path(&self) -> Option<&PathBuf> {
        match self {
            StorageRef::FilePath(path) => Some(path),
            StorageRef::ContentUri(_) => None,
        }
    }

    pub fn as_string(&self) -> String {
        match self {
            StorageRef::FilePath(path) => path.to_string_lossy().into_owned(),
            StorageRef::ContentUri(uri) => uri.clone(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn content_uri_is_not_a_filesystem_path() {
        assert!(is_content_uri(
            "content://com.android.externalstorage.documents/tree/abc"
        ));
        assert!(!is_content_uri("/storage/emulated/0/roms"));
        assert!(!is_content_uri(""));
    }

    #[test]
    fn split_preserves_document_tree_uris() {
        let refs =
            split_storage_refs("/roms/a|content://com.android.externalstorage.documents/tree/abc");
        assert_eq!(refs.len(), 2);
        assert!(refs[0].is_filesystem());
        assert_eq!(refs[1].as_path(), None);
        assert_eq!(
            refs[1].as_string(),
            "content://com.android.externalstorage.documents/tree/abc"
        );
    }
}
