const PLATFORM = "Withny";
const BASE_URL = "https://www.withny.fun";
const ICON_URL = "https://www.withny.fun/favicon.ico";

const REGEX_CHANNEL_URL = /^https?:\/\/(?:www\.)?withny\.fun\/channels\/([a-zA-Z0-9_-]+)/;
const REGEX_DETAILS_URL = /^https?:\/\/(?:www\.)?withny\.fun\/(channels|schedules|archives)\/([a-zA-Z0-9_-]+)/;

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const DEFAULT_HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ja,en;q=0.9"
};

// --- Source Methods ---

source.enable = function (config, settings, savedState) {
    // 初期化処理
};

source.saveState = function () {
    return "{}";
};

source.getHome = function () {
    return getHomePager();
};

source.searchSuggestions = function (query) {
    return [];
};

source.getSearchCapabilities = function () {
    return {
        types: [Type.Feed.Mixed],
        sorts: [Type.Order.Chronological],
        filters: []
    };
};

source.search = function (query, type, order, filters) {
    return getSearchPager(query);
};

source.getSearchChannelContentsCapabilities = function () {
    return {
        types: [Type.Feed.Mixed],
        sorts: [Type.Order.Chronological],
        filters: []
    };
};

source.searchChannelContents = function (channelUrl, query, type, order, filters) {
    return new VideoPager([], false);
};

source.searchChannels = function (query) {
    return new ChannelPager([], false);
};

source.isChannelUrl = function (url) {
    return REGEX_CHANNEL_URL.test(url);
};

source.getChannel = function (url) {
    const match = url.match(REGEX_CHANNEL_URL);
    if (!match) throw new ScriptException("Invalid channel URL: " + url);
    const username = match[1];
    const channelPageUrl = BASE_URL + "/channels/" + username;

    const response = http.GET(channelPageUrl, DEFAULT_HEADERS, false);
    if (!response.isOk) throw new ScriptException("Failed to load channel: " + response.code);

    const html = response.body;

    // チャンネル名の抽出
    const nameMatch = html.match(/"name"\s*:\s*"([^"]+)"/);
    const name = nameMatch ? nameMatch[1] : username;

    // プロフィール画像の抽出
    const profileImgMatch = html.match(/"profileImageUrl"\s*:\s*"(https:\/\/img\.withny\.fun\/[^"]+)"/);
    const profileImg = profileImgMatch ? profileImgMatch[1] : "";

    // ヘッダー画像の抽出
    const headerImgMatch = html.match(/"headerImageUrl"\s*:\s*"(https:\/\/img\.withny\.fun\/[^"]+)"/);
    const headerImg = headerImgMatch ? headerImgMatch[1] : "";

    // お気に入り数の抽出
    const subsMatch = html.match(/お気に入り登録者数\s*([\d,]+)\s*人/);
    const subscribers = subsMatch ? parseInt(subsMatch[1].replace(/,/g, "")) : 0;

    return new PlatformChannel({
        id: new PlatformID(PLATFORM, username, plugin.config.id),
        name: name,
        thumbnail: profileImg,
        banner: headerImg,
        subscribers: subscribers,
        description: "",
        url: channelPageUrl,
        links: {}
    });
};

source.getChannelCapabilities = function () {
    return {
        types: [Type.Feed.Videos],
        sorts: [Type.Order.Chronological]
    };
};

source.getChannelContents = function (url, type, order, filters) {
    const match = url.match(REGEX_CHANNEL_URL);
    if (!match) return new VideoPager([], false);
    const username = match[1];
    const channelPageUrl = BASE_URL + "/channels/" + username;

    const response = http.GET(channelPageUrl, DEFAULT_HEADERS, false);
    if (!response.isOk) return new VideoPager([], false);

    return parseArchivesFromHtml(response.body, username);
};

source.isContentDetailsUrl = function (url) {
    return REGEX_DETAILS_URL.test(url);
};

source.getContentDetails = function (url) {
    const response = http.GET(url, DEFAULT_HEADERS, false);
    if (!response.isOk) throw new ScriptException("Failed to load content: " + response.code);

    const html = response.body;

    // タイトルの抽出
    const titleMatch = html.match(/"title"\s*:\s*"([^"]+)"/) || html.match(/<title>([^<]+)<\/title>/);
    const title = titleMatch ? titleMatch[1].replace(/\s*\|.*$/, "").trim() : "Untitled";

    // サムネイルの抽出
    const thumbMatch = html.match(/"thumbnailUrl"\s*:\s*"(https:\/\/[^"]+)"/);
    const thumbnail = thumbMatch ? thumbMatch[1] : "";

    // 配信者情報の抽出
    const castNameMatch = html.match(/"cast"\s*:\s*\{[^}]*"user"\s*:\s*\{[^}]*"name"\s*:\s*"([^"]+)"/) ||
                          html.match(/"name"\s*:\s*"([^"]+)"/);
    const castName = castNameMatch ? castNameMatch[1] : "Cast";

    const castUsernameMatch = html.match(/"username"\s*:\s*"([^"]+)"/);
    const castUsername = castUsernameMatch ? castUsernameMatch[1] : "";

    const castProfileMatch = html.match(/"profileImageUrl"\s*:\s*"(https:\/\/img\.withny\.fun\/[^"]+)"/);
    const castProfile = castProfileMatch ? castProfileMatch[1] : "";

    // m3u8 URL の抽出（ライブ配信）
    const liveM3u8Match = html.match(/https:\/\/[a-z0-9]+\.(?:[a-z0-9-]+\.)*playback\.live-video\.net\/api\/video\/v1\/[^\s"'\\]+\.m3u8/);

    // m3u8 URL の抽出（アーカイブ）
    const archiveM3u8Match = html.match(/https:\/\/archive\.withny\.fun\/ivs\/v1\/[^\s"'\\]+master\.m3u8/);

    const streamUrl = liveM3u8Match ? liveM3u8Match[0].replace(/\\/g, "") :
                      archiveM3u8Match ? archiveM3u8Match[0].replace(/\\/g, "") : "";

    const isLive = !!liveM3u8Match;

    // 再生時間の抽出
    const durationMatch = html.match(/"recordingDurationMs"\s*:\s*(\d+)/);
    const duration = durationMatch ? Math.floor(parseInt(durationMatch[1]) / 1000) : 0;

    // 日付の抽出
    const dateMatch = html.match(/"createdAt"\s*:\s*"([^"]+)"/);
    const uploadDate = dateMatch ? Math.floor(new Date(dateMatch[1]).getTime() / 1000) : Math.floor(Date.now() / 1000);

    // ソースの構築
    let videoSource;
    if (isLive) {
        videoSource = new VideoSourceDescriptor([]);
    } else {
        videoSource = new VideoSourceDescriptor([]);
    }

    const details = new PlatformVideoDetails({
        id: new PlatformID(PLATFORM, url, plugin.config.id),
        name: title,
        thumbnails: thumbnail ? new Thumbnails([new Thumbnail(thumbnail, 720)]) : new Thumbnails([]),
        author: new PlatformAuthorLink(
            new PlatformID(PLATFORM, castUsername, plugin.config.id),
            castName,
            castUsername ? (BASE_URL + "/channels/" + castUsername) : "",
            castProfile
        ),
        uploadDate: uploadDate,
        duration: duration,
        viewCount: 0,
        url: url,
        isLive: isLive,
        description: "",
        video: videoSource,
        live: streamUrl ? new HLSSource({
            name: "HLS",
            duration: duration,
            url: streamUrl,
            priority: true
        }) : null,
        rating: new RatingLikes(0),
        subtitles: []
    });

    return details;
};

// --- Pager Classes ---

class WithnyHomePager extends VideoPager {
    constructor(results, hasMore, context) {
        super(results, hasMore, context);
    }
    nextPage() {
        return new VideoPager([], false);
    }
}

class WithnySearchPager extends VideoPager {
    constructor(results, hasMore, context) {
        super(results, hasMore, context);
    }
    nextPage() {
        return new VideoPager([], false);
    }
}

// --- Helper Functions ---

function getHomePager() {
    const response = http.GET(BASE_URL, DEFAULT_HEADERS, false);
    if (!response.isOk) return new VideoPager([], false);

    const html = response.body;
    const videos = extractVideosFromHtml(html);
    return new WithnyHomePager(videos, false, {});
}

function getSearchPager(query) {
    const url = BASE_URL + "/?tab=archives&q=" + encodeURIComponent(query);
    const response = http.GET(url, DEFAULT_HEADERS, false);
    if (!response.isOk) return new VideoPager([], false);

    const html = response.body;
    const videos = extractVideosFromHtml(html);
    return new WithnySearchPager(videos, false, { query: query });
}

function extractVideosFromHtml(html) {
    const videos = [];

    // Next.jsのサーバーレンダリングデータからアーカイブ情報を抽出
    const archiveRegex = /"uuid"\s*:\s*"([a-f0-9-]+)"\s*,\s*"title"\s*:\s*"([^"]+)"\s*,\s*"description"\s*:[^,]+,\s*"price"\s*:\s*(\d+)\s*,\s*"status"\s*:\s*"([^"]+)"\s*,\s*"thumbnailUrl"\s*:\s*"(https:\/\/[^"]+)"/g;

    let match;
    while ((match = archiveRegex.exec(html)) !== null) {
        const uuid = match[1];
        const title = match[2];
        const price = parseInt(match[3]);
        const status = match[4];
        const thumbnailUrl = match[5];

        if (status !== "public") continue;

        // 配信者情報を近くから抽出
        const afterMatch = html.substring(match.index, match.index + 2000);
        const castNameMatch = afterMatch.match(/"name"\s*:\s*"([^"]+)"/);
        const castUsernameMatch = afterMatch.match(/"username"\s*:\s*"([^"]+)"/);
        const castProfileMatch = afterMatch.match(/"profileImageUrl"\s*:\s*"(https:\/\/img\.withny\.fun\/[^"]+)"/);
        const durationMatch = afterMatch.match(/"recordingDurationMs"\s*:\s*(\d+)/);
        const dateMatch = afterMatch.match(/"createdAt"\s*:\s*"([^"]+)"/);

        const castName = castNameMatch ? castNameMatch[1] : "Cast";
        const castUsername = castUsernameMatch ? castUsernameMatch[1] : "";
        const castProfile = castProfileMatch ? castProfileMatch[1] : "";
        const duration = durationMatch ? Math.floor(parseInt(durationMatch[1]) / 1000) : 0;
        const uploadDate = dateMatch ? Math.floor(new Date(dateMatch[1]).getTime() / 1000) : 0;

        const videoUrl = BASE_URL + "/archives/" + uuid;

        videos.push(new PlatformVideo({
            id: new PlatformID(PLATFORM, uuid, plugin.config.id),
            name: title,
            thumbnails: new Thumbnails([new Thumbnail(thumbnailUrl, 720)]),
            author: new PlatformAuthorLink(
                new PlatformID(PLATFORM, castUsername, plugin.config.id),
                castName,
                castUsername ? (BASE_URL + "/channels/" + castUsername) : "",
                castProfile
            ),
            uploadDate: uploadDate,
            duration: duration,
            viewCount: 0,
            url: videoUrl,
            isLive: false
        }));
    }

    // ライブ配信中のキャストも抽出
    const liveRegex = /"playbackUrl"\s*:\s*"(https:\/\/[^"]+\.m3u8[^"]*)"/g;
    const liveChannelRegex = /"channelArn"\s*:\s*"[^"]*\/channel\/([^"]+)"/g;

    return videos;
}

function parseArchivesFromHtml(html, username) {
    const videos = [];

    const archiveRegex = /"uuid"\s*:\s*"([a-f0-9-]+)"\s*,\s*"title"\s*:\s*"([^"]+)"\s*,\s*"description"\s*:[^,]+,\s*"price"\s*:\s*(\d+)\s*,\s*"status"\s*:\s*"([^"]+)"\s*,\s*"thumbnailUrl"\s*:\s*"(https:\/\/[^"]+)"/g;

    let match;
    while ((match = archiveRegex.exec(html)) !== null) {
        const uuid = match[1];
        const title = match[2];
        const status = match[4];
        const thumbnailUrl = match[5];

        if (status !== "public") continue;

        const afterMatch = html.substring(match.index, match.index + 2000);
        const durationMatch = afterMatch.match(/"recordingDurationMs"\s*:\s*(\d+)/);
        const dateMatch = afterMatch.match(/"createdAt"\s*:\s*"([^"]+)"/);
        const castProfileMatch = afterMatch.match(/"profileImageUrl"\s*:\s*"(https:\/\/img\.withny\.fun\/[^"]+)"/);

        const duration = durationMatch ? Math.floor(parseInt(durationMatch[1]) / 1000) : 0;
        const uploadDate = dateMatch ? Math.floor(new Date(dateMatch[1]).getTime() / 1000) : 0;
        const castProfile = castProfileMatch ? castProfileMatch[1] : "";

        const videoUrl = BASE_URL + "/archives/" + uuid;

        videos.push(new PlatformVideo({
            id: new PlatformID(PLATFORM, uuid, plugin.config.id),
            name: title,
            thumbnails: new Thumbnails([new Thumbnail(thumbnailUrl, 720)]),
            author: new PlatformAuthorLink(
                new PlatformID(PLATFORM, username, plugin.config.id),
                username,
                BASE_URL + "/channels/" + username,
                castProfile
            ),
            uploadDate: uploadDate,
            duration: duration,
            viewCount: 0,
            url: videoUrl,
            isLive: false
        }));
    }

    return new VideoPager(videos, false);
}
