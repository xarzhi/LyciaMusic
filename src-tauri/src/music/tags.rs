use id3::TagLike;
use lofty::file::{FileType, TaggedFile, TaggedFileExt};
use lofty::picture::{MimeType, Picture, PictureType};
use lofty::probe::Probe;
use lofty::properties::FileProperties;
use lofty::tag::{Accessor, ItemKey, ItemValue, Tag, TagItem, TagType};
use std::fs;
use std::io::Cursor;
use std::path::Path;

#[derive(Default, Debug, Clone, PartialEq, Eq)]
pub struct TagTextMetadata {
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
}

pub fn read_tagged_file_from_path(path: &Path) -> lofty::error::Result<TaggedFile> {
    match Probe::open(path)?.guess_file_type()?.read() {
        Ok(tagged_file) => Ok(tagged_file),
        Err(original_err) if is_wav_path(path) => {
            read_salvaged_wav_tags(path).map_err(|_| original_err)
        }
        Err(original_err) => Err(original_err),
    }
}

pub fn extract_text_metadata<T>(tagged_file: &T) -> TagTextMetadata
where
    T: TaggedFileExt + ?Sized,
{
    let mut metadata = TagTextMetadata::default();

    for tag in ordered_tags(tagged_file) {
        if metadata.title.is_none() {
            metadata.title = read_title(tag);
        }

        if metadata.artist.is_none() {
            metadata.artist = read_artist(tag);
        }

        if metadata.album.is_none() {
            metadata.album = read_album(tag);
        }

        if metadata.title.is_some() && metadata.artist.is_some() && metadata.album.is_some() {
            break;
        }
    }

    metadata
}

pub fn extract_embedded_lyrics<T>(tagged_file: &T) -> Option<String>
where
    T: TaggedFileExt + ?Sized,
{
    let tags = ordered_tags(tagged_file);

    for tag in &tags {
        if let Some(lyrics) = tag.get_string(&ItemKey::Lyrics).and_then(clean_text) {
            return Some(lyrics);
        }
    }

    for tag in &tags {
        for item in tag.items() {
            let Some(text) = item_text(item) else {
                continue;
            };

            let is_explicit_lyrics_field = match item.key() {
                ItemKey::Comment | ItemKey::Description => true,
                ItemKey::Unknown(key) => looks_like_lyrics_key(key),
                _ => false,
            } || looks_like_lyrics_description(item.description());

            if is_explicit_lyrics_field && seems_like_lyrics_text(&text) {
                return Some(text);
            }
        }
    }

    for tag in &tags {
        for item in tag.items() {
            let Some(text) = item_text(item) else {
                continue;
            };

            if contains_lrc_timestamp(&text) {
                return Some(text);
            }
        }
    }

    None
}

pub fn find_embedded_picture<'a, T>(tagged_file: &'a T) -> Option<&'a Picture>
where
    T: TaggedFileExt + ?Sized,
{
    let tags = ordered_tags(tagged_file);

    for tag in &tags {
        if let Some(picture) = tag
            .pictures()
            .iter()
            .find(|picture| picture.pic_type() == PictureType::CoverFront)
        {
            return Some(picture);
        }
    }

    for tag in &tags {
        if let Some(picture) = tag.pictures().first() {
            return Some(picture);
        }
    }

    None
}

pub fn contains_lrc_timestamp(text: &str) -> bool {
    let bytes = text.as_bytes();
    let mut index = 0usize;

    while index < bytes.len() {
        if bytes[index] == b'[' {
            let mut cursor = index + 1;
            let mut minutes_digits = 0usize;

            while cursor < bytes.len() && bytes[cursor].is_ascii_digit() {
                minutes_digits += 1;
                cursor += 1;
            }

            if minutes_digits > 0 && cursor < bytes.len() && bytes[cursor] == b':' {
                cursor += 1;

                if cursor + 1 < bytes.len()
                    && bytes[cursor].is_ascii_digit()
                    && bytes[cursor + 1].is_ascii_digit()
                {
                    cursor += 2;

                    if cursor < bytes.len() && bytes[cursor] == b'.' {
                        cursor += 1;
                        let mut fraction_digits = 0usize;
                        while cursor < bytes.len() && bytes[cursor].is_ascii_digit() {
                            fraction_digits += 1;
                            cursor += 1;
                        }

                        if fraction_digits > 0 && cursor < bytes.len() && bytes[cursor] == b']' {
                            return true;
                        }
                    } else if cursor < bytes.len() && bytes[cursor] == b']' {
                        return true;
                    }
                }
            }
        }

        index += 1;
    }

    false
}

fn is_wav_path(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| matches!(ext.to_ascii_lowercase().as_str(), "wav" | "wave"))
        .unwrap_or(false)
}

fn read_salvaged_wav_tags(path: &Path) -> Result<TaggedFile, ()> {
    let bytes = fs::read(path).map_err(|_| ())?;
    let mut tags = Vec::new();

    if let Some(id3_size) = leading_id3v2_size(&bytes) {
        push_id3_tag(&mut tags, &bytes[..id3_size]);

        if let Some(wav_bytes) = bytes.get(id3_size..) {
            tags.extend(parse_wav_chunks(wav_bytes));
        }
    } else {
        tags.extend(parse_wav_chunks(&bytes));
    }

    if tags.is_empty() {
        return Err(());
    }

    Ok(TaggedFile::new(
        FileType::Wav,
        FileProperties::default(),
        tags,
    ))
}

fn leading_id3v2_size(bytes: &[u8]) -> Option<usize> {
    if bytes.len() < 10 || &bytes[..3] != b"ID3" {
        return None;
    }

    let size = ((bytes[6] as usize) << 21)
        | ((bytes[7] as usize) << 14)
        | ((bytes[8] as usize) << 7)
        | (bytes[9] as usize);

    Some(10 + size)
}

fn parse_wav_chunks(bytes: &[u8]) -> Vec<Tag> {
    if !has_wav_header(bytes) {
        return Vec::new();
    }

    let mut tags = Vec::new();
    let mut offset = 12usize;

    while offset + 8 <= bytes.len() {
        let chunk_id = &bytes[offset..offset + 4];
        let chunk_size = match bytes[offset + 4..offset + 8].try_into() {
            Ok(size_bytes) => u32::from_le_bytes(size_bytes) as usize,
            Err(_) => break,
        };
        let data_start = offset + 8;
        let data_end = data_start.saturating_add(chunk_size);

        if data_end > bytes.len() {
            break;
        }

        match chunk_id {
            b"id3 " | b"ID3 " => push_id3_tag(&mut tags, &bytes[data_start..data_end]),
            b"LIST" => {
                if let Some(tag) = parse_riff_info_list(&bytes[data_start..data_end]) {
                    tags.push(tag);
                }
            }
            _ => {}
        }

        offset = offset.saturating_add(8 + chunk_size + (chunk_size % 2));
    }

    tags
}

fn has_wav_header(bytes: &[u8]) -> bool {
    bytes.len() >= 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WAVE"
}

fn push_id3_tag(tags: &mut Vec<Tag>, bytes: &[u8]) {
    if let Ok(tag) = id3::Tag::read_from2(Cursor::new(bytes)) {
        tags.push(lofty_tag_from_id3(tag));
    }
}

fn parse_riff_info_list(bytes: &[u8]) -> Option<Tag> {
    if bytes.len() < 4 || &bytes[..4] != b"INFO" {
        return None;
    }

    let mut tag = Tag::new(TagType::RiffInfo);
    let mut offset = 4usize;

    while offset + 8 <= bytes.len() {
        let key = &bytes[offset..offset + 4];
        let item_size = u32::from_le_bytes(bytes[offset + 4..offset + 8].try_into().ok()?) as usize;
        let data_start = offset + 8;
        let data_end = data_start.saturating_add(item_size);

        if data_end > bytes.len() {
            break;
        }

        if let Some(value) = decode_riff_info_text(&bytes[data_start..data_end]) {
            let key = String::from_utf8_lossy(key);
            let _ = tag.insert(TagItem::new(
                ItemKey::from_key(TagType::RiffInfo, &key),
                ItemValue::Text(value),
            ));
        }

        offset = offset.saturating_add(8 + item_size + (item_size % 2));
    }

    let has_items = tag.items().next().is_some();
    has_items.then_some(tag)
}

fn decode_riff_info_text(raw: &[u8]) -> Option<String> {
    let raw = raw
        .split(|byte| *byte == 0)
        .next()
        .unwrap_or(raw)
        .trim_ascii();

    if raw.is_empty() {
        return None;
    }

    if raw.len() >= 2 && raw.len() % 2 == 0 {
        let units: Vec<u16> = raw
            .chunks_exact(2)
            .map(|chunk| u16::from_le_bytes([chunk[0], chunk[1]]))
            .collect();

        if let Ok(decoded) = String::from_utf16(&units) {
            if let Some(text) = clean_text(&decoded) {
                return Some(text);
            }
        }
    }

    if let Ok(decoded) = std::str::from_utf8(raw) {
        if let Some(text) = clean_text(decoded) {
            return Some(text);
        }
    }

    let (decoded, _, _) = encoding_rs::GBK.decode(raw);
    clean_text(&decoded)
}

fn lofty_tag_from_id3(id3_tag: id3::Tag) -> Tag {
    let mut lofty_tag = Tag::new(TagType::Id3v2);

    insert_optional_text(&mut lofty_tag, ItemKey::TrackTitle, id3_tag.title());
    insert_optional_text(&mut lofty_tag, ItemKey::TrackArtist, id3_tag.artist());
    insert_optional_text(&mut lofty_tag, ItemKey::AlbumTitle, id3_tag.album());
    insert_optional_text(
        &mut lofty_tag,
        ItemKey::RecordingDate,
        id3_tag.year().map(|value| value.to_string()).as_deref(),
    );
    insert_optional_text(
        &mut lofty_tag,
        ItemKey::TrackNumber,
        id3_tag.track().map(|value| value.to_string()).as_deref(),
    );

    for comment in id3_tag.comments() {
        let Some(text) = clean_text(&comment.text) else {
            continue;
        };
        let _ = lofty_tag.insert(TagItem::new(ItemKey::Comment, ItemValue::Text(text)));
    }

    for lyrics in id3_tag.lyrics() {
        let Some(text) = clean_text(&lyrics.text) else {
            continue;
        };
        let _ = lofty_tag.insert(TagItem::new(ItemKey::Lyrics, ItemValue::Text(text)));
    }

    for picture in id3_tag.pictures() {
        lofty_tag.push_picture(Picture::new_unchecked(
            PictureType::from_u8(u8::from(picture.picture_type)),
            Some(MimeType::from_str(&picture.mime_type)),
            clean_text(&picture.description),
            picture.data.clone(),
        ));
    }

    lofty_tag
}

fn insert_optional_text(tag: &mut Tag, key: ItemKey, value: Option<&str>) {
    if let Some(value) = value.and_then(clean_text) {
        let _ = tag.insert_text(key, value);
    }
}

fn ordered_tags<'a, T>(tagged_file: &'a T) -> Vec<&'a Tag>
where
    T: TaggedFileExt + ?Sized,
{
    let mut tags = Vec::new();

    push_unique_tag(&mut tags, tagged_file.tag(TagType::Id3v2));
    push_unique_tag(&mut tags, tagged_file.primary_tag());
    push_unique_tag(&mut tags, tagged_file.tag(TagType::RiffInfo));

    for tag in tagged_file.tags() {
        push_unique_tag(&mut tags, Some(tag));
    }

    tags
}

fn push_unique_tag<'a>(tags: &mut Vec<&'a Tag>, candidate: Option<&'a Tag>) {
    let Some(candidate) = candidate else {
        return;
    };

    if !tags.iter().any(|existing| std::ptr::eq(*existing, candidate)) {
        tags.push(candidate);
    }
}

fn read_title(tag: &Tag) -> Option<String> {
    tag.title()
        .as_deref()
        .and_then(clean_text)
        .or_else(|| read_tag_text(tag, &[ItemKey::TrackTitle], &["TITLE", "INAM"]))
}

fn read_artist(tag: &Tag) -> Option<String> {
    tag.artist().as_deref().and_then(clean_text).or_else(|| {
        read_tag_text(
            tag,
            &[
                ItemKey::TrackArtist,
                ItemKey::AlbumArtist,
                ItemKey::Performer,
                ItemKey::Composer,
            ],
            &["ARTIST", "IART", "AUTHOR"],
        )
    })
}

fn read_album(tag: &Tag) -> Option<String> {
    tag.album().as_deref().and_then(clean_text).or_else(|| {
        read_tag_text(
            tag,
            &[ItemKey::AlbumTitle, ItemKey::OriginalAlbumTitle],
            &["ALBUM", "IPRD"],
        )
    })
}

fn read_tag_text(tag: &Tag, keys: &[ItemKey], unknown_keys: &[&str]) -> Option<String> {
    for key in keys {
        if let Some(text) = tag.get_string(key).and_then(clean_text) {
            return Some(text);
        }
    }

    tag.items().find_map(|item| match item.key() {
        ItemKey::Unknown(key)
            if unknown_keys
                .iter()
                .any(|candidate| key.eq_ignore_ascii_case(candidate)) =>
        {
            item_text(item)
        }
        _ => None,
    })
}

fn item_text(item: &TagItem) -> Option<String> {
    item.value()
        .text()
        .or_else(|| item.value().locator())
        .and_then(clean_text)
}

fn clean_text(value: &str) -> Option<String> {
    let trimmed = value.trim_matches('\0').trim();
    (!trimmed.is_empty()).then(|| trimmed.to_string())
}

fn looks_like_lyrics_key(raw_key: &str) -> bool {
    matches!(
        raw_key.to_ascii_uppercase().as_str(),
        "LYRICS" | "LYRIC" | "LRC" | "KLYRIC" | "UNSYNCEDLYRICS" | "SYNCEDLYRICS"
    )
}

fn looks_like_lyrics_description(description: &str) -> bool {
    let normalized = description.trim().to_ascii_uppercase();
    !normalized.is_empty() && (normalized.contains("LYRIC") || normalized.contains("LRC"))
}

fn seems_like_lyrics_text(text: &str) -> bool {
    contains_lrc_timestamp(text) || text.lines().filter(|line| !line.trim().is_empty()).count() >= 2
}

#[cfg(test)]
mod tests {
    use super::{
        extract_embedded_lyrics, extract_text_metadata, find_embedded_picture,
        read_tagged_file_from_path,
    };
    use lofty::file::{FileType, TaggedFile, TaggedFileExt};
    use lofty::picture::{MimeType, Picture, PictureType};
    use lofty::probe::Probe;
    use lofty::properties::FileProperties;
    use lofty::tag::{ItemKey, ItemValue, Tag, TagItem, TagType};
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn make_tagged_file(tags: Vec<Tag>) -> TaggedFile {
        TaggedFile::new(FileType::Wav, FileProperties::default(), tags)
    }

    fn create_id3_prefixed_wav_bytes() -> Vec<u8> {
        let mut bytes = Vec::new();

        bytes.extend_from_slice(b"ID3");
        bytes.extend_from_slice(&[3, 0, 0, 0, 0, 0, 0]);
        bytes.extend_from_slice(b"RIFF");
        bytes.extend_from_slice(&38u32.to_le_bytes());
        bytes.extend_from_slice(b"WAVE");
        bytes.extend_from_slice(b"fmt ");
        bytes.extend_from_slice(&16u32.to_le_bytes());
        bytes.extend_from_slice(&1u16.to_le_bytes());
        bytes.extend_from_slice(&1u16.to_le_bytes());
        bytes.extend_from_slice(&44_100u32.to_le_bytes());
        bytes.extend_from_slice(&88_200u32.to_le_bytes());
        bytes.extend_from_slice(&2u16.to_le_bytes());
        bytes.extend_from_slice(&16u16.to_le_bytes());
        bytes.extend_from_slice(b"data");
        bytes.extend_from_slice(&2u32.to_le_bytes());
        bytes.extend_from_slice(&[0, 0]);

        bytes
    }

    #[test]
    fn prefers_id3v2_text_over_riff_info() {
        let mut riff = Tag::new(TagType::RiffInfo);
        riff.insert_text(ItemKey::TrackTitle, "RIFF Title".to_string());
        riff.insert_text(ItemKey::TrackArtist, "RIFF Artist".to_string());
        riff.insert_text(ItemKey::AlbumTitle, "RIFF Album".to_string());

        let mut id3 = Tag::new(TagType::Id3v2);
        id3.insert_text(ItemKey::TrackTitle, "ID3 Title".to_string());
        id3.insert_text(ItemKey::TrackArtist, "ID3 Artist".to_string());
        id3.insert_text(ItemKey::AlbumTitle, "ID3 Album".to_string());

        let metadata = extract_text_metadata(&make_tagged_file(vec![riff, id3]));

        assert_eq!(metadata.title.as_deref(), Some("ID3 Title"));
        assert_eq!(metadata.artist.as_deref(), Some("ID3 Artist"));
        assert_eq!(metadata.album.as_deref(), Some("ID3 Album"));
    }

    #[test]
    fn falls_back_to_riff_info_text() {
        let mut riff = Tag::new(TagType::RiffInfo);
        riff.insert_text(ItemKey::TrackTitle, "Wave Title".to_string());
        riff.insert_text(ItemKey::TrackArtist, "Wave Artist".to_string());
        riff.insert_text(ItemKey::AlbumTitle, "Wave Album".to_string());

        let metadata = extract_text_metadata(&make_tagged_file(vec![riff]));

        assert_eq!(metadata.title.as_deref(), Some("Wave Title"));
        assert_eq!(metadata.artist.as_deref(), Some("Wave Artist"));
        assert_eq!(metadata.album.as_deref(), Some("Wave Album"));
    }

    #[test]
    fn extracts_lyrics_from_comment_when_it_contains_lrc() {
        let mut id3 = Tag::new(TagType::Id3v2);
        id3.insert(TagItem::new(
            ItemKey::Comment,
            ItemValue::Text("[00:01.00]line one\n[00:02.00]line two".to_string()),
        ));

        let lyrics = extract_embedded_lyrics(&make_tagged_file(vec![id3]));

        assert_eq!(
            lyrics.as_deref(),
            Some("[00:01.00]line one\n[00:02.00]line two")
        );
    }

    #[test]
    fn prefers_front_cover_picture() {
        let mut id3 = Tag::new(TagType::Id3v2);
        id3.push_picture(Picture::new_unchecked(
            PictureType::CoverBack,
            Some(MimeType::Jpeg),
            None,
            vec![1, 2, 3],
        ));

        let mut riff = Tag::new(TagType::RiffInfo);
        riff.push_picture(Picture::new_unchecked(
            PictureType::CoverFront,
            Some(MimeType::Png),
            None,
            vec![4, 5, 6],
        ));

        let tagged_file = make_tagged_file(vec![id3, riff]);
        let picture = find_embedded_picture(&tagged_file).expect("picture should exist");

        assert_eq!(picture.pic_type(), PictureType::CoverFront);
        assert_eq!(picture.data(), &[4, 5, 6]);
    }

    #[test]
    fn reads_wav_with_leading_id3v2_header_via_fallback() {
        let temp_name = format!(
            "lycia_id3_prefixed_{}.wav",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos()
        );
        let temp_path = std::env::temp_dir().join(temp_name);

        fs::write(&temp_path, create_id3_prefixed_wav_bytes()).expect("temp wav should be written");

        let extension_only = Probe::open(&temp_path).expect("probe should open").read();
        assert!(extension_only.is_err());

        let tagged_file =
            read_tagged_file_from_path(&temp_path).expect("fallback parser should read the wav");
        assert_eq!(tagged_file.file_type(), FileType::Wav);

        let _ = fs::remove_file(temp_path);
    }
}
