#include <algorithm>
#include <windows.h>
#include <d3d11_1.h>
#include <dxgi1_2.h>
#include <wrl/client.h>
#include <atomic>
#include <thread>
#include <mutex>
#include <string>
#include <sstream>
#include <iostream>
#include <deque>
#include <chrono>
#include "SR.hpp"
using Microsoft::WRL::ComPtr;
static HWND host=nullptr, window=nullptr;
static HANDLE sourceProcess=nullptr;
static std::atomic<bool> running{true}, active{true};
static std::mutex pendingMutex, outputMutex;
struct Frame{unsigned long long id=0; HANDLE handle=nullptr;};
static Frame pending;
static ComPtr<ID3D11Device> device;
static ComPtr<ID3D11DeviceContext> context;
static ComPtr<IDXGISwapChain> swapchain;
static ComPtr<ID3D11RenderTargetView> output;
static ComPtr<ID3D11Texture2D> input;
static ComPtr<ID3D11ShaderResourceView> inputView;
static SimulatedReality::SRInterfaceDX11* sr=nullptr;
static int width=0,height=0;
struct Upload{unsigned long long id;ComPtr<ID3D11Texture2D> source;ComPtr<IDXGIKeyedMutex> mutex;ComPtr<ID3D11Query> query;bool locked;};
static std::deque<Upload> uploads;
static bool ready=false, visible=false;
static void emit(const std::string& s);
static void pollUploads(){while(!uploads.empty()){auto& u=uploads.front();if(context->GetData(u.query.Get(),nullptr,0,D3D11_ASYNC_GETDATA_DONOTFLUSH)==S_FALSE)break;if(u.locked)u.mutex->ReleaseSync(0);emit("{\"type\":\"release\",\"id\":"+std::to_string(u.id)+"}");uploads.pop_front();}}
static void emit(const std::string& s){std::lock_guard<std::mutex> l(outputMutex);std::cout<<s<<std::endl;}
static void error(const char* message){emit(std::string("{\"type\":\"error\",\"message\":\"")+message+"\"}");running=false;}
static bool createSR(){
 __try { return SUCCEEDED(SimulatedReality::CreateSRInterfaceDX11(context.Get(),window,&sr))&&sr; }
 __except(EXCEPTION_EXECUTE_HANDLER){return false;}
}
static bool weave(){__try{sr->Weave();return true;}__except(EXCEPTION_EXECUTE_HANDLER){return false;}}
static void lens(bool enabled){if(!sr)return;__try{if(enabled)SimulatedReality::SREnableLensHint();else SimulatedReality::SRDisableLensHint();}__except(EXCEPTION_EXECUTE_HANDLER){}}
static LRESULT CALLBACK proc(HWND h,UINT m,WPARAM w,LPARAM l){if(m==WM_NCHITTEST)return HTTRANSPARENT;if(m==WM_CLOSE){running=false;return 0;}return DefWindowProc(h,m,w,l);}
static bool setup(HANDLE shared){
 ComPtr<IDXGIFactory2> factory; if(FAILED(CreateDXGIFactory1(IID_PPV_ARGS(&factory))))return false;
 ComPtr<IDXGIAdapter> adapter;
 if(shared){LUID luid{};if(SUCCEEDED(factory->GetSharedResourceAdapterLuid(shared,&luid))){for(UINT i=0;;i++){ComPtr<IDXGIAdapter> a;if(FAILED(factory->EnumAdapters(i,&a)))break;DXGI_ADAPTER_DESC d{};a->GetDesc(&d);if(d.AdapterLuid.HighPart==luid.HighPart&&d.AdapterLuid.LowPart==luid.LowPart){adapter=a;break;}}}}
 D3D_FEATURE_LEVEL level; if(FAILED(D3D11CreateDevice(adapter.Get(),adapter?D3D_DRIVER_TYPE_UNKNOWN:D3D_DRIVER_TYPE_HARDWARE,nullptr,D3D11_CREATE_DEVICE_BGRA_SUPPORT,nullptr,0,D3D11_SDK_VERSION,&device,&level,&context)))return false;
 ComPtr<IDXGIDevice> gpuDevice;device.As(&gpuDevice);ComPtr<IDXGIAdapter> selected;gpuDevice->GetAdapter(&selected);DXGI_ADAPTER_DESC gpu{};selected->GetDesc(&gpu);char gpuName[256]{};WideCharToMultiByte(CP_UTF8,0,gpu.Description,-1,gpuName,255,nullptr,nullptr);emit(std::string("{\"type\":\"gpu\",\"name\":\"")+gpuName+"\"}");
 DXGI_SWAP_CHAIN_DESC desc{};desc.BufferCount=2;desc.BufferDesc.Width=width;desc.BufferDesc.Height=height;desc.BufferDesc.Format=DXGI_FORMAT_B8G8R8A8_UNORM;desc.BufferUsage=DXGI_USAGE_RENDER_TARGET_OUTPUT;desc.OutputWindow=window;desc.SampleDesc.Count=1;desc.Windowed=TRUE;desc.SwapEffect=DXGI_SWAP_EFFECT_DISCARD;
 if(FAILED(factory->CreateSwapChain(device.Get(),&desc,&swapchain)))return false;
 factory->MakeWindowAssociation(window,DXGI_MWA_NO_ALT_ENTER);
 if(!createSR())return false;
 sr->SetShaderSRGBConversion(true,true);sr->SetCrosstalk(SimulatedReality::SRCrosstalkMode::Dynamic,1.0f);
 return true;
}
static bool target(int w,int h){
 if(output&&w==width&&h==height)return true;
 context->OMSetRenderTargets(0,nullptr,nullptr);output.Reset();
 if(w!=width||h!=height){if(FAILED(swapchain->ResizeBuffers(0,w,h,DXGI_FORMAT_UNKNOWN,0)))return false;width=w;height=h;}
 ComPtr<ID3D11Texture2D> back;if(FAILED(swapchain->GetBuffer(0,IID_PPV_ARGS(&back))))return false;
 return SUCCEEDED(device->CreateRenderTargetView(back.Get(),nullptr,&output));
}
static bool receive(Frame f){
 ComPtr<ID3D11Device1> d1;device.As(&d1);ComPtr<ID3D11Texture2D> shared;
 if(!d1||FAILED(d1->OpenSharedResource1(f.handle,IID_PPV_ARGS(&shared))))return false;
 D3D11_TEXTURE2D_DESC desc{};shared->GetDesc(&desc);const bool crop=desc.Width%2!=0;desc.Width&=~1u;D3D11_TEXTURE2D_DESC old{};if(input)input->GetDesc(&old);
 if(!input||old.Width!=desc.Width||old.Height!=desc.Height||old.Format!=desc.Format){inputView.Reset();input.Reset();desc.BindFlags=D3D11_BIND_SHADER_RESOURCE;desc.MiscFlags=0;desc.Usage=D3D11_USAGE_DEFAULT;desc.CPUAccessFlags=0;
 if(FAILED(device->CreateTexture2D(&desc,nullptr,&input))||FAILED(device->CreateShaderResourceView(input.Get(),nullptr,&inputView)))return false;sr->SetInputTexture(inputView.Get());}
 ComPtr<IDXGIKeyedMutex> mutex;shared.As(&mutex);bool locked=false;if(mutex){if(mutex->AcquireSync(0,100)!=S_OK)return false;locked=true;}
 if(crop){D3D11_BOX box{0,0,0,desc.Width,desc.Height,1};context->CopySubresourceRegion(input.Get(),0,0,0,0,shared.Get(),0,&box);}else context->CopyResource(input.Get(),shared.Get());
 D3D11_QUERY_DESC queryDesc{D3D11_QUERY_EVENT,0};ComPtr<ID3D11Query> query;if(FAILED(device->CreateQuery(&queryDesc,&query))){if(locked)mutex->ReleaseSync(0);return false;}
 context->End(query.Get());context->Flush();uploads.push_back({f.id,shared,mutex,query,locked});return true;
}
int main(int argc,char**argv){
 SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);SetThreadDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
 bool probe=argc>1&&std::string(argv[1])=="--probe";
 if(!probe&&argc>=3){host=reinterpret_cast<HWND>(std::stoull(argv[1]));sourceProcess=OpenProcess(PROCESS_DUP_HANDLE,FALSE,DWORD(std::stoul(argv[2])));}
 SetDefaultDllDirectories(LOAD_LIBRARY_SEARCH_DEFAULT_DIRS|LOAD_LIBRARY_SEARCH_USER_DIRS);
 AddDllDirectory(L"C:\\Program Files\\LeiaSR\\Platform\\bin");AddDllDirectory(L"C:\\Program Files\\Simulated Reality\\SR Platform\\bin");
 if(!LoadLibraryW(L"SimulatedRealityCore.dll")||!LoadLibraryW(L"SimulatedRealityDirectX.dll")){error("Leia SR runtime could not be loaded.");return 2;}
 WNDCLASSW wc{};wc.lpfnWndProc=proc;wc.hInstance=GetModuleHandle(nullptr);wc.lpszClassName=L"PyroCadeLeiaPresenter";RegisterClassW(&wc);
 RECT rect{0,0,1280,720};POINT point{};if(host){GetClientRect(host,&rect);ClientToScreen(host,&point);}width=rect.right;height=rect.bottom;
 window=CreateWindowExW(WS_EX_LAYERED|WS_EX_TRANSPARENT|WS_EX_NOACTIVATE|WS_EX_TOOLWINDOW,wc.lpszClassName,L"PyroCade Leia SR",WS_POPUP,point.x,point.y,width,height,host,nullptr,wc.hInstance,nullptr);SetLayeredWindowAttributes(window,0,255,LWA_ALPHA);
 if(probe){bool ok=setup(nullptr);emit(ok?"{\"type\":\"ready\"}":"{\"type\":\"error\",\"message\":\"SR display or service unavailable.\"}");if(sr){lens(false);sr->Delete();sr=nullptr;}DestroyWindow(window);return ok?0:3;}
 if(!host||!sourceProcess){error("Could not connect to the launcher window.");return 4;}
 std::thread([]{std::string line;while(running&&std::getline(std::cin,line)){std::istringstream in(line);std::string cmd;in>>cmd;if(cmd=="QUIT"){running=false;break;}if(cmd=="ACTIVE"){int flag;in>>flag;active=flag!=0;}if(cmd=="FRAME"){Frame f;unsigned long long raw=0;in>>f.id>>raw;if(!DuplicateHandle(sourceProcess,reinterpret_cast<HANDLE>(raw),GetCurrentProcess(),&f.handle,0,FALSE,DUPLICATE_SAME_ACCESS)){error("Could not open the shared stereo frame.");break;}std::lock_guard<std::mutex> lock(pendingMutex);if(pending.handle){CloseHandle(pending.handle);emit("{\"type\":\"release\",\"id\":"+std::to_string(pending.id)+",\"copied\":false}");}pending=f;}}running=false;}).detach();
 emit("{\"type\":\"prepared\"}");
 unsigned long long sourceFrame=0, lastPresentedFrame=0;
 unsigned int freshFrames=0;
 ULONGLONG sampleStart=GetTickCount64(), lastFreshTime=0, longestGap=0;
 while(running&&IsWindow(host)){
  MSG message;while(PeekMessage(&message,nullptr,0,0,PM_REMOVE)){TranslateMessage(&message);DispatchMessage(&message);}
  POINT p{};RECT r{};GetClientRect(host,&r);ClientToScreen(host,&p);if(context)pollUploads();
  Frame f;{std::lock_guard<std::mutex> lock(pendingMutex);f=pending;pending={};}
  if(f.handle){if(!device&&!setup(f.handle)){CloseHandle(f.handle);error("Leia SR display initialization failed.");break;}bool ok=receive(f);CloseHandle(f.handle);if(!ok){error("The GPU could not read the stereo frame.");break;}sourceFrame=f.id;if(!ready){ready=true;emit("{\"type\":\"ready\"}");}}
  const bool show=active&&input&&GetForegroundWindow()==host&&IsWindowVisible(host)&&!IsIconic(host)&&IsWindowEnabled(host)&&r.right>0&&r.bottom>0;
  if(!show){if(visible){ShowWindow(window,SW_HIDE);lens(false);visible=false;}sampleStart=GetTickCount64();lastFreshTime=longestGap=freshFrames=0;Sleep(uploads.empty()?4:1);continue;}
  RECT current{};GetWindowRect(window,&current);if(current.left!=p.x||current.top!=p.y||current.right-current.left!=r.right||current.bottom-current.top!=r.bottom)SetWindowPos(window,HWND_TOP,p.x,p.y,r.right,r.bottom,SWP_NOACTIVATE|SWP_NOOWNERZORDER);
  if(!target(r.right,r.bottom)){error("Could not resize the stereo output.");break;}
  ID3D11RenderTargetView* view=output.Get();context->OMSetRenderTargets(1,&view,nullptr);D3D11_VIEWPORT vp{0,0,float(width),float(height),0,1};context->RSSetViewports(1,&vp);
  float black[4]={0,0,0,1};context->ClearRenderTargetView(output.Get(),black);
  if(!weave()){error("The SR weaver stopped responding.");break;}
  if(!visible){ShowWindow(window,SW_SHOWNOACTIVATE);lens(true);visible=true;}
  const HRESULT presented=swapchain->Present(1,0);
  if(FAILED(presented)){error("The 3D display connection was lost.");break;}
  const ULONGLONG now=GetTickCount64();
  if(presented==S_OK&&sourceFrame!=lastPresentedFrame){
   lastPresentedFrame=sourceFrame;
   if(lastFreshTime)longestGap=(std::max)(longestGap,now-lastFreshTime);
   lastFreshTime=now;
   ++freshFrames;
  }
  if(now-sampleStart>=1000){
   emit("{\"type\":\"cadence\",\"fps\":"+std::to_string(freshFrames*1000.0/(now-sampleStart))+",\"longestGapMs\":"+std::to_string(longestGap)+"}");
   sampleStart=now;
   freshFrames=0;
   longestGap=0;
  }
  if(!ready){ready=true;emit("{\"type\":\"ready\"}");}
 }
 lens(false);if(sr){sr->Delete();sr=nullptr;}if(window)DestroyWindow(window);if(sourceProcess)CloseHandle(sourceProcess);return 0;
}
