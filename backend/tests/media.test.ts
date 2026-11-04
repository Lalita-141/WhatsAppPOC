import "./helpers/test-env.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import sharp from "sharp";
import { api, baseUrl, org, prisma, registerUser, setupHarness } from "./helpers/harness.js";

setupHarness();

type User = Awaited<ReturnType<typeof registerUser>>;

// A real JPEG with GPS data in its EXIF block, to prove the server strips it.
const photo = () =>
  sharp({ create: { width: 800, height: 600, channels: 3, background: { r: 200, g: 50, b: 50 } } })
    .jpeg()
    .withExif({ IFD0: { Make: "TestCam" }, IFD3: { GPSLatitude: "12/1 58/1 0/1", GPSLatitudeRef: "N" } })
    .toBuffer();

const pdf = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");

const upload = async (user: User, kind: string, mimeType: string, bytes: Buffer, fileName = "file") => {
  const started = await api("POST", "/media/uploads", {
    token: user.token,
    body: { kind, mimeType, size: bytes.length, fileName },
  });
  if (started.status !== 201) return { started, finished: null };
  const response = await fetch(`${baseUrl}${started.json.data.uploadPath}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${user.token}`, "Content-Type": "application/octet-stream" },
    body: new Uint8Array(bytes),
  });
  return { started, finished: { status: response.status, json: (await response.json()) as any } };
};

const download = async (user: User, mediaId: string, variant = "original") => {
  const link = await api("GET", `/media/${mediaId}/url?variant=${variant}`, { token: user.token });
  if (link.status !== 200) return { status: link.status, body: null as Buffer | null, headers: null as Headers | null, url: "" };
  const response = await fetch(`${baseUrl}${link.json.data.url}`);
  return { status: response.status, body: Buffer.from(await response.arrayBuffer()), headers: response.headers, url: link.json.data.url };
};

describe("uploads", () => {
  it("stores a photo, strips its location data and makes a thumbnail", async () => {
    const alice = await registerUser();
    const original = await photo();
    assert.ok((await sharp(original).metadata()).exif, "the test photo has EXIF");

    const { finished } = await upload(alice, "IMAGE", "image/jpeg", original, "beach.jpg");
    assert.equal(finished!.status, 200, JSON.stringify(finished!.json));
    assert.equal(finished!.json.data.hasThumbnail, true);
    assert.equal(finished!.json.data.width, 800);

    const stored = await download(alice, finished!.json.data.mediaId);
    assert.equal(stored.status, 200);
    assert.equal((await sharp(stored.body!).metadata()).exif, undefined);

    const thumb = await download(alice, finished!.json.data.mediaId, "thumbnail");
    assert.ok(((await sharp(thumb.body!).metadata()).width ?? 0) <= 320);
  });

  it("refuses a file whose bytes do not match its type", async () => {
    const alice = await registerUser();
    const fake = Buffer.concat([Buffer.from("MZ"), Buffer.alloc(200, 1)]);
    const { finished } = await upload(alice, "DOCUMENT", "application/pdf", fake, "invoice.pdf");
    assert.equal(finished!.json.errorCode, "CONTENT_MISMATCH");
    assert.equal((await prisma.media_file.findFirstOrThrow()).status, "PENDING");
  });

  it("refuses disallowed types, oversize files and a body larger than declared", async () => {
    const alice = await registerUser();
    const exe = await api("POST", "/media/uploads", { token: alice.token, body: { kind: "DOCUMENT", mimeType: "application/x-msdownload", size: 10 } });
    assert.equal(exe.status, 415);

    await prisma.organization_setting.update({ where: { org_id: org.a }, data: { max_upload_mb: 1 } });
    const big = await api("POST", "/media/uploads", { token: alice.token, body: { kind: "DOCUMENT", mimeType: "application/pdf", size: 2 * 1024 * 1024 } });
    assert.equal(big.json.errorCode, "FILE_TOO_LARGE");

    const started = await api("POST", "/media/uploads", { token: alice.token, body: { kind: "DOCUMENT", mimeType: "application/pdf", size: 10 } });
    const response = await fetch(`${baseUrl}${started.json.data.uploadPath}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${alice.token}`, "Content-Type": "application/octet-stream" },
      body: new Uint8Array(pdf),
    });
    assert.equal(response.status, 413);
  });

  it("refuses uploads when the organization turned file sharing off, except profile photos", async () => {
    const alice = await registerUser();
    await prisma.organization_setting.update({ where: { org_id: org.a }, data: { file_sharing_enabled: false } });

    const { started } = await upload(alice, "DOCUMENT", "application/pdf", pdf);
    assert.equal(started.json.errorCode, "FILE_SHARING_DISABLED");
    const avatar = await upload(alice, "AVATAR", "image/jpeg", await photo());
    assert.equal(avatar.finished!.status, 200);
  });

  it("does not let someone else finish another person's upload", async () => {
    const alice = await registerUser();
    const mallory = await registerUser();
    const started = await api("POST", "/media/uploads", { token: alice.token, body: { kind: "DOCUMENT", mimeType: "application/pdf", size: pdf.length } });
    const response = await fetch(`${baseUrl}${started.json.data.uploadPath}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${mallory.token}`, "Content-Type": "application/octet-stream" },
      body: new Uint8Array(pdf),
    });
    assert.equal(response.status, 404);
  });
});

describe("downloads", () => {
  it("lets only people in the chat open a sent file, through expiring signed links", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const mallory = await registerUser();
    const { finished } = await upload(alice, "DOCUMENT", "application/pdf", pdf, "report.pdf");
    const mediaId = finished!.json.data.mediaId;

    assert.equal((await download(bob, mediaId)).status, 404, "not shared yet");

    const sent = await api("POST", "/chat/personal-chat/send", {
      token: alice.token,
      body: { receiverUserOrganizationId: bob.userOrganizationId, mediaId, message: "Q3 report" },
    });
    assert.equal(sent.status, 201);
    assert.equal(sent.json.data.messageType, "DOCUMENT");
    assert.equal(sent.json.data.media.fileName, "report.pdf");

    const forBob = await download(bob, mediaId);
    assert.equal(forBob.status, 200);
    assert.deepEqual(forBob.body, pdf);
    assert.match(forBob.headers!.get("content-disposition")!, /attachment/);
    assert.equal((await download(mallory, mediaId)).status, 404);

    const tampered = forBob.url.replace(/signature=[^&]+/, "signature=AAAA");
    assert.equal((await fetch(`${baseUrl}${tampered}`)).status, 404);
    const otherFile = forBob.url.replace(`/media/${mediaId}/`, `/media/${Number(mediaId) + 1}/`);
    assert.equal((await fetch(`${baseUrl}${otherFile}`)).status, 404);
  });

  it("serves byte ranges for seeking", async () => {
    const alice = await registerUser();
    const { finished } = await upload(alice, "DOCUMENT", "application/pdf", pdf);
    const link = await api("GET", `/media/${finished!.json.data.mediaId}/url`, { token: alice.token });
    const response = await fetch(`${baseUrl}${link.json.data.url}`, { headers: { Range: "bytes=0-4" } });

    assert.equal(response.status, 206);
    assert.equal(response.headers.get("content-range"), `bytes 0-4/${pdf.length}`);
    assert.equal(Buffer.from(await response.arrayBuffer()).toString(), "%PDF-");
  });

  it("revokes access when the message is deleted for everyone", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const { finished } = await upload(alice, "IMAGE", "image/jpeg", await photo());
    const mediaId = finished!.json.data.mediaId;
    const sent = await api("POST", "/chat/personal-chat/send", { token: alice.token, body: { receiverUserOrganizationId: bob.userOrganizationId, mediaId } });
    assert.equal((await download(bob, mediaId)).status, 200);

    await api("DELETE", `/chat/messages/${sent.json.data.messageId}?scope=everyone`, { token: alice.token });
    assert.equal((await download(bob, mediaId)).status, 404);
  });

  it("only attaches the sender's own finished upload", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const { finished } = await upload(bob, "IMAGE", "image/jpeg", await photo());
    const stolen = await api("POST", "/chat/personal-chat/send", {
      token: alice.token,
      body: { receiverUserOrganizationId: bob.userOrganizationId, mediaId: finished!.json.data.mediaId },
    });
    assert.equal(stolen.json.errorCode, "INVALID_MEDIA");
  });

  it("shares group files with members only, and forwarded files with the new chat", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const carol = await registerUser();
    const group = await api("POST", "/groups", { token: alice.token, body: { name: "Team", memberIds: [bob.userOrganizationId] } });
    const { finished } = await upload(alice, "IMAGE", "image/jpeg", await photo());
    const mediaId = finished!.json.data.mediaId;
    const posted = await api("POST", `/groups/${group.json.data.groupId}/messages`, { token: alice.token, body: { mediaId } });
    assert.equal(posted.json.data.messageType, "IMAGE");

    assert.equal((await download(bob, mediaId)).status, 200);
    assert.equal((await download(carol, mediaId)).status, 404);

    await api("POST", `/groups/${group.json.data.groupId}/messages/${posted.json.data.messageId}/forward`, {
      token: bob.token,
      body: { receiverUserOrganizationIds: [carol.userOrganizationId] },
    });
    assert.equal((await download(carol, mediaId)).status, 200);
  });
});

describe("profile photo", () => {
  it("sets a photo that others see according to profile photo privacy", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const { finished } = await upload(alice, "AVATAR", "image/jpeg", await photo());
    const set = await api("PUT", "/user/photo", { token: alice.token, body: { mediaId: finished!.json.data.mediaId } });
    assert.equal(set.status, 200);

    const mediaId = set.json.data.profilePhotoMediaId;
    // Default privacy is "my contacts": nobody before a message is exchanged.
    assert.equal((await download(bob, mediaId)).status, 404);
    await api("POST", "/chat/personal-chat/send", { token: alice.token, body: { receiverUserOrganizationId: bob.userOrganizationId, message: "hi" } });
    assert.equal((await download(bob, mediaId)).status, 200);

    await api("PUT", "/user/settings/privacy", { token: alice.token, body: { profilePrivacy: "NOBODY" } });
    assert.equal((await download(bob, mediaId)).status, 404);
  });

  it("refuses a file that is not a finished photo upload of the caller", async () => {
    const alice = await registerUser();
    const { finished } = await upload(alice, "DOCUMENT", "application/pdf", pdf);
    const result = await api("PUT", "/user/photo", { token: alice.token, body: { mediaId: finished!.json.data.mediaId } });
    assert.equal(result.json.errorCode, "INVALID_MEDIA");
  });
});
