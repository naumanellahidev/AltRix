class MailServiceError(Exception):
    """Base exception for all mail service operations."""
    def __init__(self, message="Mail service error occurred", code="MAIL_SERVICE_ERROR", status_code=500):
        super().__init__(message)
        self.message = message
        self.code = code
        self.status_code = status_code


class MailboxNotFoundError(MailServiceError):
    def __init__(self, mailbox_email):
        super().__init__(
            message=f"Mailbox '{mailbox_email}' was not found in system",
            code="MAILBOX_NOT_FOUND",
            status_code=404
        )


class MailboxAccessDeniedError(MailServiceError):
    def __init__(self, principal_id, mailbox_email):
        super().__init__(
            message=f"Access denied: User '{principal_id}' is not authorized to access mailbox '{mailbox_email}'",
            code="MAILBOX_ACCESS_DENIED",
            status_code=403
        )


class ImapUnavailableError(MailServiceError):
    def __init__(self, detail="Unable to connect to internal IMAP daemon"):
        super().__init__(
            message=f"Mail daemon service unavailable: {detail}",
            code="IMAP_UNAVAILABLE",
            status_code=503
        )


class AuthFailedError(MailServiceError):
    def __init__(self, detail="IMAP authentication failed for mailbox"):
        super().__init__(
            message=f"Authentication failure: {detail}",
            code="IMAP_AUTH_FAILED",
            status_code=401
        )


class FolderNotFoundError(MailServiceError):
    def __init__(self, folder_name):
        super().__init__(
            message=f"Mail folder '{folder_name}' does not exist",
            code="FOLDER_NOT_FOUND",
            status_code=404
        )
