import { App, Modal } from "obsidian";

/**
 * One-time prompt shown on the first successful connection when the
 * device name is still the auto-seeded platform default. The seeded
 * name is prefilled in an editable field; the single Keep action saves
 * the (possibly edited) name and marks the prompt handled. Closing
 * without keeping leaves the prompt unhandled, but main.ts only offers
 * it once per session, so it returns on a later launch, not in a loop.
 */
export class DeviceNamePromptModal extends Modal {
	private input: HTMLInputElement | null = null;

	constructor(
		app: App,
		private readonly initialName: string,
		private readonly onConfirm: (name: string) => void | Promise<void>,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl("h3", { text: "Name this device" });
		contentEl.createEl("p", {
			text: "This device got an automatic name from its platform. Keep it, or replace it with a name you will recognise in cursors and sync history. You can change it anytime in settings.",
		});

		this.input = contentEl.createEl("input", { type: "text" });
		this.input.value = this.initialName;
		this.input.placeholder = this.initialName;

		const buttonRow = contentEl.createDiv({ cls: "modal-button-container" });
		const keepBtn = buttonRow.createEl("button", {
			text: "Keep",
			cls: "mod-cta",
		});
		keepBtn.addEventListener("click", () => {
			const value = this.input?.value ?? this.initialName;
			this.close();
			void this.onConfirm(value);
		});
	}

	onClose(): void {
		this.contentEl.empty();
		this.input = null;
	}
}
