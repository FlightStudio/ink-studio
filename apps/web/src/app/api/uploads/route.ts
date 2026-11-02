import { type UploadedAsset, uploadPurposeSchema } from "@repo/api";
import { ServiceError } from "@repo/errors";
import { handleRequest } from "@/server/handle-json";
import { getAssetService } from "@/server/services";

const MAX_FILE_NAME_LENGTH = 255;

function invalidRequest(): ServiceError {
	return new ServiceError("invalid_input", "invalid_request");
}

function fileNameOf(request: Request): string {
	const header = request.headers.get("x-file-name");
	if (header === null) throw invalidRequest();
	let name: string;
	try {
		name = decodeURIComponent(header).trim();
	} catch {
		throw invalidRequest();
	}
	if (
		name.length === 0 ||
		name.length > MAX_FILE_NAME_LENGTH ||
		/\p{Cc}/u.test(name)
	) {
		throw invalidRequest();
	}
	return name;
}

function declaredBytesOf(request: Request): number | null {
	const header = request.headers.get("content-length");
	if (header === null || !/^\d+$/.test(header)) return null;
	return Number(header);
}

export function POST(request: Request) {
	return handleRequest(request, async ({ member }) => {
		const purpose = uploadPurposeSchema.safeParse(
			new URL(request.url).searchParams.get("purpose"),
		);
		if (!purpose.success) throw invalidRequest();
		const filename = fileNameOf(request);
		if (!request.body) throw invalidRequest();
		const asset = await getAssetService().upload(member.userOrganization, {
			purpose: purpose.data,
			filename,
			declaredBytes: declaredBytesOf(request),
			body: request.body,
			uploadedByUserId: member.user.id,
		});
		const uploaded: UploadedAsset = { id: asset.id };
		return Response.json(uploaded, { status: 201 });
	});
}
