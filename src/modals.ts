import { App, Modal, Setting } from "obsidian";

export class TextPromptModal extends Modal {
  constructor(
    app: App,
    private heading: string,
    private initial: string,
    private onSubmit: (value: string) => void,
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText(this.heading);
    let value = this.initial;
    const submit = () => {
      const v = value.trim();
      if (!v) return;
      this.close();
      this.onSubmit(v);
    };
    new Setting(this.contentEl).addText((t) => {
      t.setValue(this.initial).onChange((v) => (value = v));
      t.inputEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter") submit();
      });
      window.setTimeout(() => {
        t.inputEl.focus();
        t.inputEl.select();
      }, 0);
    });
    new Setting(this.contentEl).addButton((b) => b.setButtonText("OK").setCta().onClick(submit));
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

export class ConfirmModal extends Modal {
  constructor(
    app: App,
    private message: string,
    private confirmLabel: string,
    private onConfirm: () => void,
  ) {
    super(app);
  }

  onOpen(): void {
    this.contentEl.createEl("p", { text: this.message });
    new Setting(this.contentEl)
      .addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()))
      .addButton((b) =>
        b
          .setButtonText(this.confirmLabel)
          .setWarning()
          .onClick(() => {
            this.close();
            this.onConfirm();
          }),
      );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
