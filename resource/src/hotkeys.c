#define _WIN32_WINNT 0x0501
#include <windows.h>
#include <wtsapi32.h>

//Keycode definitions
#define PLAY_PAUSE_HOTKEY 1
#define STOP_HOTKEY 2
#define PREV_HOTKEY 3
#define NEXT_HOTKEY 4

//Global variables
HINSTANCE       msgWindowHInstance;
HWND            msgWindowHandle;
HANDLE          threadHandle = NULL;
int             lastKeycode = 0;
HANDLE          lastKeycodeMutex;
BOOL            cleaningUp = FALSE;

//Function prototypes
void                init();
static void         handleHotkeys(void *param);
int                 getLastKeycode();
void                setLastKeycode(int newKeycode);
void                cleanup();
LRESULT CALLBACK    WindowProcedure(HWND, UINT, WPARAM, LPARAM);
BOOL                RegisterDLLWindowClass(char szClassName[]);
DWORD WINAPI        CreateHiddenWindow( LPVOID lpParam );

//DLL Entry point
BOOL WINAPI DllMain(HINSTANCE hinstDLL, DWORD fdwReason, LPVOID lpvReserved)
{
    lastKeycodeMutex = CreateMutex(
        NULL,              // default security attributes
        FALSE,             // initially not owned
        NULL               // unnamed mutex
        );

    if(fdwReason == DLL_PROCESS_ATTACH) {
        msgWindowHInstance = hinstDLL;
        CreateThread(
                NULL,
                0,
                (LPTHREAD_START_ROUTINE)CreateHiddenWindow,
                NULL,
                0,
                NULL
                );
    }
    return TRUE;
}

BOOL RegisterDLLWindowClass(char szClassName[])
{
    WNDCLASSEX wc;
    wc.hInstance =  msgWindowHInstance;
    wc.lpszClassName = szClassName;
    wc.lpfnWndProc = WindowProcedure;
    wc.style = CS_DBLCLKS;
    wc.cbSize = sizeof (WNDCLASSEX);
    wc.hIcon = LoadIcon (NULL, IDI_APPLICATION);
    wc.hIconSm = LoadIcon (NULL, IDI_APPLICATION);
    wc.hCursor = LoadCursor (NULL, IDC_ARROW);
    wc.lpszMenuName = NULL;
    wc.cbClsExtra = 0;
    wc.cbWndExtra = 0;
    wc.hbrBackground = (HBRUSH) COLOR_BACKGROUND;
    if (!RegisterClassEx (&wc)) {
        return 0;
    }
}

DWORD WINAPI CreateHiddenWindow( LPVOID lpParam )
{
    MSG messages;
    char szClassName[] = "msgWindowClass";
    RegisterDLLWindowClass(szClassName);
    msgWindowHandle = CreateWindowEx (
            0,
            szClassName,
            NULL,
            WS_EX_PALETTEWINDOW,
            CW_USEDEFAULT,
            CW_USEDEFAULT,
            0,
            0,
            HWND_DESKTOP,
            NULL,
            msgWindowHInstance,
            NULL
            );

    WTSRegisterSessionNotification(msgWindowHandle, NOTIFY_FOR_THIS_SESSION );

    while (GetMessage (&messages, NULL, 0, 0))
    {
        TranslateMessage(&messages);
        DispatchMessage(&messages);
    }
    return 1;
}

//Creates a thread which registers hotkeys and handles hotkey events.
void init()
{
	//Check that there isn't already a message handling thread running.
	if (threadHandle == NULL)
	{
		//Reset the cleaningUp flag to false.
		cleaningUp = FALSE;
		
		//Spawn a new thread which begins its execution in the function below.
		threadHandle = CreateThread(NULL, 0,
			(LPTHREAD_START_ROUTINE)handleHotkeys, NULL, 0, NULL);
	}
}

//Entry point of the message handling thread
static void handleHotkeys(void *param)
{
	//Register the media keys as hotkeys.
	if (RegisterHotKey(NULL, PLAY_PAUSE_HOTKEY, 0x4000, 0xB3) == 0) return;
	if (RegisterHotKey(NULL, STOP_HOTKEY, 0x4000, 0xB2) == 0) return;
	if (RegisterHotKey(NULL, PREV_HOTKEY, 0x4000, 0xB1) == 0) return;
	if (RegisterHotKey(NULL, NEXT_HOTKEY, 0x4000, 0xB0) == 0) return;
	
	//Handle hotkey events from Windows. Loop until we begin cleaning up.
	MSG msg = {0};
	
	while (cleaningUp == FALSE)
	{
		if (PeekMessage(&msg, NULL, 0, 0, 1) > 0)
		{
			if (msg.message == WM_HOTKEY)
			{
				if (msg.wParam == PLAY_PAUSE_HOTKEY)
                    setLastKeycode(1);
				else if (msg.wParam == STOP_HOTKEY)
                    setLastKeycode(2);
				else if (msg.wParam == PREV_HOTKEY)
                    setLastKeycode(3);
				else if (msg.wParam == NEXT_HOTKEY)
                    setLastKeycode(4);
			}
		}
		
		//Sleep so we don't use excess CPU cycles.
		Sleep(50);
	}
	
	//Unregister the hotkeys after the loop terminates.
	UnregisterHotKey(NULL, PLAY_PAUSE_HOTKEY);
	UnregisterHotKey(NULL, STOP_HOTKEY);
	UnregisterHotKey(NULL, PREV_HOTKEY);
	UnregisterHotKey(NULL, NEXT_HOTKEY);
}

//Returns the code of the last media key pressed since the previous call to
//getLastKeycode(). Returns 0 if no media key has been pressed since the previous
//call to getLastKeycode().
int getLastKeycode()
{
	int retVal;
    DWORD waitForMutexRelease = WaitForSingleObject(
        lastKeycodeMutex,   // handle to mutex
        INFINITE            // no time-out interval
        );
    switch (waitForMutexRelease)
    {
        // The thread got ownership of the mutex
        case WAIT_OBJECT_0:
            retVal = lastKeycode;
            lastKeycode = 0;
            if (! ReleaseMutex(lastKeycodeMutex))
            {
                // TODO:Handle error.
            }
            break;

        // The thread got ownership of an abandoned mutex
        case WAIT_ABANDONED:
            retVal = 0;
    }

	return retVal;
}

void setLastKeycode(int newKeycode) {
    DWORD waitForMutexRelease = WaitForSingleObject(
        lastKeycodeMutex,   // handle to mutex
        INFINITE            // no time-out interval
        );
    switch (waitForMutexRelease)
    {
        // The thread got ownership of the mutex
        case WAIT_OBJECT_0:
            lastKeycode = newKeycode;
            if (! ReleaseMutex(lastKeycodeMutex))
            {
                // TODO:Handle error.
            }
            break;

        // The thread got ownership of an abandoned mutex
        case WAIT_ABANDONED:
            return;
    }
}


//Unregisters the hotkeys and destroys the message handling thread
void cleanup()
{
	//Check that there is a spawned thread to cleanup.
	if (threadHandle != NULL)
	{
		//Flag that we are cleaning up.
		cleaningUp = TRUE;
		
		//Wait for the message handling thread to unregister the hotkeys.
		WaitForSingleObject(threadHandle, INFINITE);
		
		//Close the thread's handle.
		CloseHandle(threadHandle);
		threadHandle = NULL;
	}

    if (msgWindowHandle != NULL) {
        WTSUnRegisterSessionNotification(msgWindowHandle);
        SendMessage(msgWindowHandle, WM_CLOSE, 0, 0);
    }
}

// Procedure that handles the messages from the hidden window thread.
LRESULT CALLBACK WindowProcedure(HWND hWnd, UINT message, WPARAM wParam, LPARAM lParam)
{
    switch (message)
    {
        int wmId;
        case WM_DESTROY:
            PostQuitMessage (0);
            break;

        case WM_WTSSESSION_CHANGE:
            wmId = LOWORD(wParam);
            if (wmId == WTS_SESSION_LOCK) {
                setLastKeycode(2);
            }
            break;

        default:
            return DefWindowProc(hWnd, message, wParam, lParam);
    }
    return 0;
}

